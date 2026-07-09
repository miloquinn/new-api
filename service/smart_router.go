package service

import (
	"fmt"
	"sort"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

// 名义 token 用量：让「倍率计费」与「按次计费」的模型可以在同一坐标系下比较估算成本。
// 倍率计费成本 = ratio × (prompt + completionRatio × completion)，按次计费成本 = price × QuotaPerUnit，
// 两者均为 quota 单位。仅用于候选排序，不参与真实计费。
const (
	smartRouterNominalPromptTokens     = 1000.0
	smartRouterNominalCompletionTokens = 1000.0
)

// EstimateModelCostScore 返回模型的估算成本评分（quota 单位），仅用于智能路由候选排序。
// 命中分时定价时段时按当前时段的主价格估算（峰谷价下的成本优先按"此刻"的真实价格排序）。
// 未配置价格/倍率的模型使用默认倍率兜底，自然排在已配置的便宜模型之后。
func EstimateModelCostScore(modelName string) float64 {
	value, usePrice, _ := ratio_setting.GetModelRatioOrPrice(modelName)
	if usePrice {
		return value * common.QuotaPerUnit
	}
	if timedRatio, _, ok := ratio_setting.GetTimedModelRatio(modelName); ok {
		value = timedRatio
	}
	completionRatio := ratio_setting.GetCompletionRatio(modelName)
	return value * (smartRouterNominalPromptTokens + completionRatio*smartRouterNominalCompletionTokens)
}

// SortModelsByEstimatedCost 按估算成本从低到高稳定排序（等价成本保持管理员配置的顺序）。
func SortModelsByEstimatedCost(models []string) []string {
	sorted := make([]string, len(models))
	copy(sorted, models)
	sort.SliceStable(sorted, func(i, j int) bool {
		return EstimateModelCostScore(sorted[i]) < EstimateModelCostScore(sorted[j])
	})
	return sorted
}

// ResolveSmartRouterModel 将智能路由虚拟模型名解析为具体模型名。
// 返回值：(解析后的模型名, 是否为智能路由, 错误)。
//   - 请求的模型不是智能路由时原样返回，isRouter 为 false。
//   - 是智能路由时按策略排序候选模型，返回第一个在当前分组下有可用渠道的模型，
//     并把路由名写入 ContextKeySmartRouter 供日志记录。
//   - 所有候选模型都不可用时返回错误。
//
// 选择分两轮：第一轮跳过处于降权冷却期的候选（见 smart_router_health.go），
// 第二轮在全部候选都被降权时不看健康状态兜底，保证降权机制只影响顺序、
// 不会让本来有渠道的请求失败。
//
// 解析发生在渠道选择之前，之后的计费、渠道重试都基于解析出的具体模型
// （即单次请求内不跨模型降级，模型降级由下一次请求的解析完成）。
func ResolveSmartRouterModel(c *gin.Context, requestedModel string, tokenGroup string, requestPath string) (string, bool, error) {
	router := model.GetEnabledSmartRouterByName(requestedModel)
	if router == nil {
		return requestedModel, false, nil
	}

	candidates := router.GetModelList()
	if router.Strategy == model.SmartRouterStrategyCostFirst {
		candidates = SortModelsByEstimatedCost(candidates)
	}

	for _, skipDemoted := range []bool{true, false} {
		for _, candidate := range candidates {
			if candidate == "" || candidate == requestedModel {
				continue
			}
			// 候选模型本身也是智能路由时跳过，避免链式/递归解析
			if model.GetEnabledSmartRouterByName(candidate) != nil {
				continue
			}
			if skipDemoted && smartRouterCandidateDemoted(tokenGroup, candidate) {
				continue
			}
			if !smartRouterCandidateAvailable(c, tokenGroup, candidate, requestPath) {
				continue
			}
			if !skipDemoted {
				logger.LogDebug(c, "smart router %s: all candidates demoted, falling back to %s", router.Name, candidate)
			}
			common.SetContextKey(c, constant.ContextKeySmartRouter, router.Name)
			logger.LogDebug(c, "smart router %s resolved to model %s (strategy: %s)", router.Name, candidate, router.Strategy)
			return candidate, true, nil
		}
	}
	return "", true, fmt.Errorf("smart router %s has no available candidate model", router.Name)
}

// smartRouterCandidateAvailable 判断候选模型在当前 token 分组下是否有可用渠道。
// tokenGroup 为 "auto" 时，用户的任一自动分组下可用即视为可用。
func smartRouterCandidateAvailable(c *gin.Context, tokenGroup string, modelName string, requestPath string) bool {
	if tokenGroup == "auto" {
		userGroup := common.GetContextKeyString(c, constant.ContextKeyUserGroup)
		for _, group := range GetUserAutoGroup(userGroup) {
			if channel, _ := model.GetRandomSatisfiedChannel(group, modelName, 0, requestPath); channel != nil {
				return true
			}
		}
		return false
	}
	channel, _ := model.GetRandomSatisfiedChannel(tokenGroup, modelName, 0, requestPath)
	return channel != nil
}
