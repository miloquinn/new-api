package service

import (
	"testing"

	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/stretchr/testify/require"
)

// 成本优先策略的核心契约：按 GetModelRatioOrPrice 估算的成本从低到高排序，
// 按次计费（price）与按倍率计费（ratio × 名义 token 量）折算到同一 quota 坐标系比较，
// 等价成本保持原始（管理员配置的）顺序。
func TestSortModelsByEstimatedCost(t *testing.T) {
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{
		"cheap-model": 0.1,
		"mid-model": 1,
		"expensive-model": 10
	}`))
	require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(`{
		"cheap-model": 1,
		"mid-model": 1,
		"expensive-model": 1
	}`))
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{}`))

	sorted := SortModelsByEstimatedCost([]string{"expensive-model", "cheap-model", "mid-model"})
	require.Equal(t, []string{"cheap-model", "mid-model", "expensive-model"}, sorted)
}

func TestSortModelsByEstimatedCostMixedPriceAndRatio(t *testing.T) {
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{
		"ratio-model": 1
	}`))
	require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(`{
		"ratio-model": 2
	}`))
	// ratio-model 估算成本 = 1 × (1000 + 2×1000) = 3000 quota
	// price-cheap 估算成本 = 0.001 × 500000 = 500 quota（低于 ratio-model）
	// price-expensive 估算成本 = 0.1 × 500000 = 50000 quota（高于 ratio-model）
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{
		"price-cheap": 0.001,
		"price-expensive": 0.1
	}`))

	sorted := SortModelsByEstimatedCost([]string{"price-expensive", "ratio-model", "price-cheap"})
	require.Equal(t, []string{"price-cheap", "ratio-model", "price-expensive"}, sorted)
}

func TestSortModelsByEstimatedCostStableOnEqualCost(t *testing.T) {
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{
		"same-a": 1,
		"same-b": 1
	}`))
	require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(`{
		"same-a": 1,
		"same-b": 1
	}`))
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{}`))

	sorted := SortModelsByEstimatedCost([]string{"same-b", "same-a"})
	require.Equal(t, []string{"same-b", "same-a"}, sorted)
}

// 峰谷价与成本优先的组合契约：命中分时定价的模型按当前时段的主价格参与排序，
// 峰时涨价的"平时便宜"模型要让位给此刻更便宜的候选。
// 用全天时段规则（0-1440）保证测试与真实时钟无关。
func TestSortModelsByEstimatedCostRespectsTimedPrice(t *testing.T) {
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{
		"peak-model": 0.5,
		"flat-model": 1
	}`))
	require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(`{
		"peak-model": 1,
		"flat-model": 1
	}`))
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{}`))
	// 基础价 peak-model(0.5) < flat-model(1)，但当前时段 peak-model 涨到 2
	require.NoError(t, ratio_setting.UpdateTimedPriceRulesByJSONString(`{
		"peak-model": [{"start_minute": 0, "end_minute": 1440, "ratio": 2}]
	}`))
	t.Cleanup(func() {
		require.NoError(t, ratio_setting.UpdateTimedPriceRulesByJSONString(`{}`))
	})

	sorted := SortModelsByEstimatedCost([]string{"peak-model", "flat-model"})
	require.Equal(t, []string{"flat-model", "peak-model"}, sorted)
}
