package ratio_setting

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 固定时钟 + 干净规则表的测试夹具
func setupTimedPriceTest(t *testing.T, beijingHHMM string) {
	t.Helper()
	parsed, err := time.Parse("15:04", beijingHHMM)
	require.NoError(t, err)
	// 构造一个北京时间为 beijingHHMM 的时刻（用 UTC 表达：北京时间 = UTC+8）
	fixed := time.Date(2026, 7, 9, parsed.Hour(), parsed.Minute(), 0, 0, timedPriceLocation)
	timedPriceNow = func() time.Time { return fixed }
	require.NoError(t, UpdateTimedPriceRulesByJSONString(`{}`))
	t.Cleanup(func() {
		timedPriceNow = func() time.Time { return time.Now() }
		_ = UpdateTimedPriceRulesByJSONString(`{}`)
	})
}

func TestTimedPriceRuleValidation(t *testing.T) {
	tests := []struct {
		name    string
		rules   []TimedPriceRule
		wantErr bool
	}{
		{"valid single", []TimedPriceRule{{0, 480, 0.5}}, false},
		{"valid adjacent", []TimedPriceRule{{0, 480, 0.5}, {480, 1440, 2}}, false},
		{"valid cross midnight", []TimedPriceRule{{1320, 360, 0.5}}, false},
		{"valid free window", []TimedPriceRule{{0, 60, 0}}, false},
		{"overlap", []TimedPriceRule{{0, 480, 0.5}, {479, 600, 1}}, true},
		{"cross midnight overlap", []TimedPriceRule{{1320, 360, 0.5}, {0, 10, 1}}, true},
		{"empty range", []TimedPriceRule{{100, 100, 1}}, true},
		{"minute out of range", []TimedPriceRule{{0, 1441, 1}}, true},
		{"negative start", []TimedPriceRule{{-1, 100, 1}}, true},
		{"negative ratio", []TimedPriceRule{{0, 100, -0.5}}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateTimedPriceRules(tt.rules)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestUpdateTimedPriceRulesRejectsInvalidJSON(t *testing.T) {
	setupTimedPriceTest(t, "12:00")
	assert.Error(t, UpdateTimedPriceRulesByJSONString(`{"m": [{"start_minute": 0, "end_minute": 0, "ratio": 1}]}`))
	assert.Error(t, UpdateTimedPriceRulesByJSONString(`not json`))
	// NaN/Inf 无法通过 JSON 表达，负数在校验层拒绝
	assert.Error(t, UpdateTimedPriceRulesByJSONString(`{"m": [{"start_minute": 0, "end_minute": 60, "ratio": -1}]}`))
}

func TestGetTimedModelRatioWindowBoundary(t *testing.T) {
	rules := `{"test-model": [{"start_minute": 0, "end_minute": 480, "ratio": 0.25}]}`

	// 时段内起点（含）
	setupTimedPriceTest(t, "00:00")
	require.NoError(t, UpdateTimedPriceRulesByJSONString(rules))
	ratio, window, ok := GetTimedModelRatio("test-model")
	require.True(t, ok)
	assert.Equal(t, 0.25, ratio)
	assert.Equal(t, "00:00-08:00", window)

	// 时段内最后一分钟
	setupTimedPriceTest(t, "07:59")
	require.NoError(t, UpdateTimedPriceRulesByJSONString(rules))
	_, _, ok = GetTimedModelRatio("test-model")
	assert.True(t, ok)

	// 终点（不含）
	setupTimedPriceTest(t, "08:00")
	require.NoError(t, UpdateTimedPriceRulesByJSONString(rules))
	_, _, ok = GetTimedModelRatio("test-model")
	assert.False(t, ok)

	// 未配置的模型
	_, _, ok = GetTimedModelRatio("other-model")
	assert.False(t, ok)
}

func TestGetTimedModelRatioCrossMidnight(t *testing.T) {
	rules := `{"night-model": [{"start_minute": 1320, "end_minute": 360, "ratio": 0.1}]}`

	// 22:00-06:00 跨午夜时段：23:30 命中
	setupTimedPriceTest(t, "23:30")
	require.NoError(t, UpdateTimedPriceRulesByJSONString(rules))
	ratio, _, ok := GetTimedModelRatio("night-model")
	require.True(t, ok)
	assert.Equal(t, 0.1, ratio)

	// 05:59 命中
	setupTimedPriceTest(t, "05:59")
	require.NoError(t, UpdateTimedPriceRulesByJSONString(rules))
	_, _, ok = GetTimedModelRatio("night-model")
	assert.True(t, ok)

	// 12:00 未命中
	setupTimedPriceTest(t, "12:00")
	require.NoError(t, UpdateTimedPriceRulesByJSONString(rules))
	_, _, ok = GetTimedModelRatio("night-model")
	assert.False(t, ok)
}

// 北京时间换算契约：规则按 UTC+8 解释，与服务器时区无关
func TestGetTimedModelRatioUsesBeijingTime(t *testing.T) {
	setupTimedPriceTest(t, "12:00")
	require.NoError(t, UpdateTimedPriceRulesByJSONString(
		`{"tz-model": [{"start_minute": 600, "end_minute": 780, "ratio": 0.5}]}`)) // 10:00-13:00

	// 北京时间 12:00 == UTC 04:00，注入 UTC 时钟验证换算
	timedPriceNow = func() time.Time {
		return time.Date(2026, 7, 9, 4, 0, 0, 0, time.UTC)
	}
	_, window, ok := GetTimedModelRatio("tz-model")
	require.True(t, ok)
	assert.Equal(t, "10:00-13:00", window)

	// UTC 14:00 == 北京时间 22:00，未命中
	timedPriceNow = func() time.Time {
		return time.Date(2026, 7, 9, 14, 0, 0, 0, time.UTC)
	}
	_, _, ok = GetTimedModelRatio("tz-model")
	assert.False(t, ok)
}
