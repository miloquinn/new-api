package service

import (
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"

	"github.com/gin-gonic/gin"
)

// 智能路由候选模型的健康记忆（进程内半开熔断）。
//
// 渠道 auto-ban 只有在错误类型命中禁用条件时才会剔除故障渠道；候选模型的渠道
// "在报错但仍处于启用状态" 时，成本优先策略会持续把流量解析到同一个故障模型。
// 这里按 (分组, 模型) 记录连续失败：达到阈值后进入冷却期（降权），解析时排到
// 未降权候选之后；冷却期结束后自动放行探测流量（半开），成功一次即恢复，
// 再次失败立即重新降权。降权只改变候选顺序，所有候选都降权时仍按策略顺序
// 兜底选择，行为不会劣于没有该机制时。
const (
	// smartRouterFailureThreshold 连续失败达到该次数后触发降权
	smartRouterFailureThreshold = 3
	// smartRouterDemotionDuration 降权冷却期
	smartRouterDemotionDuration = 60 * time.Second
	// smartRouterFailureStaleAfter 距上次失败超过该时长后，连续失败计数重新从零开始，
	// 避免相隔很久的零星失败累计触发降权
	smartRouterFailureStaleAfter = 10 * time.Minute
)

type smartRouterHealthEntry struct {
	consecutiveFailures int
	lastFailureAt       time.Time
	demotedUntil        time.Time
}

var (
	smartRouterHealthMu sync.Mutex
	smartRouterHealth   = make(map[string]*smartRouterHealthEntry)
	// smartRouterHealthNow 供测试注入时钟
	smartRouterHealthNow = time.Now
)

func smartRouterHealthKey(group string, modelName string) string {
	return group + "|" + modelName
}

// smartRouterCandidateDemoted 报告候选模型是否处于降权冷却期。
func smartRouterCandidateDemoted(group string, modelName string) bool {
	smartRouterHealthMu.Lock()
	defer smartRouterHealthMu.Unlock()
	entry, ok := smartRouterHealth[smartRouterHealthKey(group, modelName)]
	if !ok {
		return false
	}
	return smartRouterHealthNow().Before(entry.demotedUntil)
}

func recordSmartRouterSuccess(group string, modelName string) {
	smartRouterHealthMu.Lock()
	defer smartRouterHealthMu.Unlock()
	delete(smartRouterHealth, smartRouterHealthKey(group, modelName))
}

// recordSmartRouterFailure 记录一次失败，返回该模型是否由未降权状态进入降权状态
// （首次达到阈值，或半开探测失败后重新降权）。已处于降权状态（兜底流量）时
// 每次失败都会顺延冷却期，但不重复返回 true。
func recordSmartRouterFailure(group string, modelName string) bool {
	smartRouterHealthMu.Lock()
	defer smartRouterHealthMu.Unlock()
	key := smartRouterHealthKey(group, modelName)
	now := smartRouterHealthNow()
	entry, ok := smartRouterHealth[key]
	if !ok {
		entry = &smartRouterHealthEntry{}
		smartRouterHealth[key] = entry
	}
	if !entry.lastFailureAt.IsZero() && now.Sub(entry.lastFailureAt) > smartRouterFailureStaleAfter {
		entry.consecutiveFailures = 0
	}
	entry.consecutiveFailures++
	entry.lastFailureAt = now
	if entry.consecutiveFailures < smartRouterFailureThreshold {
		return false
	}
	newlyDemoted := !now.Before(entry.demotedUntil)
	entry.demotedUntil = now.Add(smartRouterDemotionDuration)
	return newlyDemoted
}

// RecordSmartRouterResult 在请求结束后记录智能路由解析出的模型的成败。
// modelName 为解析出的具体模型名（由调用方在解析时捕获，不依赖后续 context 状态，
// 渠道选择失败提前返回的路径也能正确记录）。
// 仅统计明确的可用性信号：2xx/3xx 视为成功，429/5xx 视为失败；
// 其余 4xx（参数错误、鉴权失败、配额不足等）不反映模型健康度，不计入。
func RecordSmartRouterResult(c *gin.Context, modelName string) {
	routerName := common.GetContextKeyString(c, constant.ContextKeySmartRouter)
	if routerName == "" || modelName == "" || c.Writer == nil {
		return
	}
	group := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
	status := c.Writer.Status()
	switch {
	case status < http.StatusBadRequest:
		recordSmartRouterSuccess(group, modelName)
	case status == http.StatusTooManyRequests || status >= http.StatusInternalServerError:
		if recordSmartRouterFailure(group, modelName) {
			logger.LogWarn(c, fmt.Sprintf("smart router %s: model %s demoted for %s after %d consecutive failures (group: %s)",
				routerName, modelName, smartRouterDemotionDuration, smartRouterFailureThreshold, group))
		}
	}
}
