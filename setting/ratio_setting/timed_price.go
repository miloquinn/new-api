package ratio_setting

import (
	"fmt"
	"math"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
)

// 时段价格（分时定价）：管理员按模型配置若干个北京时间时段，每个时段设置该模型
// 在此期间生效的主价格（以模型倍率存储，与 ModelRatio 同单位；人民币换算只发生在
// 前端展示层）。补全/缓存/图像/音频等细分价格都是相对主倍率的乘数，因此会随时段
// 主价格自动等比联动。同一模型的时段不允许重叠；未命中任何时段时使用基础 ModelRatio。
//
// 时段用 [StartMinute, EndMinute) 表示自北京时间 00:00 起的分钟数，EndMinute 允许
// 1440（当天结束）。支持跨午夜时段（Start > End，如 22:00-06:00），匹配时按环形区间判断。
//
// 仅对按量（token）计费的模型生效；按次计费与表达式计费模型不支持时段价格。
//
// 存储格式（option "TimedPriceRules"，JSON）：
// {"deepseek-chat": [{"start_minute":0,"end_minute":480,"ratio":0.25}]}

type TimedPriceRule struct {
	StartMinute int     `json:"start_minute"`
	EndMinute   int     `json:"end_minute"`
	Ratio       float64 `json:"ratio"`
}

const minutesPerDay = 24 * 60

// timedPriceLocation 时段解释所用时区：固定北京时间（UTC+8），
// 保证多节点跨时区部署时行为一致。
var timedPriceLocation = time.FixedZone("Asia/Shanghai", 8*3600)

var timedPriceRulesMap = types.NewRWMap[string, []TimedPriceRule]()

// timedPriceNow 供测试注入时钟
var timedPriceNow = func() time.Time { return time.Now() }

// normalizeSegments 把一条规则展开为不跨午夜的 [start, end) 分钟区间集合
func (r TimedPriceRule) normalizeSegments() [][2]int {
	if r.StartMinute == r.EndMinute {
		return nil
	}
	if r.StartMinute < r.EndMinute {
		return [][2]int{{r.StartMinute, r.EndMinute}}
	}
	// 跨午夜：22:00-06:00 => [22:00, 24:00) + [00:00, 06:00)
	return [][2]int{{r.StartMinute, minutesPerDay}, {0, r.EndMinute}}
}

// FormatTimedPriceWindow 返回规则的时段文本，如 "08:00-20:00"，用于日志与展示。
func (r TimedPriceRule) FormatTimedPriceWindow() string {
	return fmt.Sprintf("%02d:%02d-%02d:%02d",
		r.StartMinute/60, r.StartMinute%60, r.EndMinute/60, r.EndMinute%60)
}

// ValidateTimedPriceRules 校验一个模型的时段规则集合：
// 分钟越界、价格非法（负数、NaN、Inf）、时段重叠均返回错误。
// ratio 允许为 0（免费时段），与 ModelRatio 的取值语义一致。
func ValidateTimedPriceRules(rules []TimedPriceRule) error {
	occupied := make([]bool, minutesPerDay)
	for i, rule := range rules {
		if rule.StartMinute < 0 || rule.StartMinute >= minutesPerDay ||
			rule.EndMinute < 0 || rule.EndMinute > minutesPerDay {
			return fmt.Errorf("rule %d: minutes out of range [0, 1440]", i+1)
		}
		if rule.StartMinute == rule.EndMinute {
			return fmt.Errorf("rule %d: empty time range", i+1)
		}
		if rule.Ratio < 0 || math.IsNaN(rule.Ratio) || math.IsInf(rule.Ratio, 0) {
			return fmt.Errorf("rule %d: ratio must be a finite non-negative number", i+1)
		}
		for _, seg := range rule.normalizeSegments() {
			for m := seg[0]; m < seg[1]; m++ {
				if occupied[m] {
					return fmt.Errorf("rule %d: time range overlaps another rule", i+1)
				}
				occupied[m] = true
			}
		}
	}
	return nil
}

func UpdateTimedPriceRulesByJSONString(jsonStr string) error {
	var parsed map[string][]TimedPriceRule
	if err := common.Unmarshal([]byte(jsonStr), &parsed); err != nil {
		return err
	}
	for model, rules := range parsed {
		if err := ValidateTimedPriceRules(rules); err != nil {
			return fmt.Errorf("model %s: %w", model, err)
		}
	}
	return types.LoadFromJsonStringWithCallback(timedPriceRulesMap, jsonStr, InvalidateExposedDataCache)
}

func TimedPriceRules2JSONString() string {
	return timedPriceRulesMap.MarshalJSONString()
}

// GetTimedPriceRules 返回模型的时段规则（精确名，其次归一化名），无配置时返回 nil。
func GetTimedPriceRules(modelName string) []TimedPriceRule {
	if rules, ok := timedPriceRulesMap.Get(modelName); ok {
		return rules
	}
	normalized := FormatMatchingModelName(modelName)
	if normalized != modelName {
		if rules, ok := timedPriceRulesMap.Get(normalized); ok {
			return rules
		}
	}
	return nil
}

// GetTimedModelRatio 返回模型当前（北京时间）生效的时段主价格倍率及时段文本。
// 未配置或未命中任何时段时返回 (0, "", false)。
func GetTimedModelRatio(modelName string) (float64, string, bool) {
	rules := GetTimedPriceRules(modelName)
	if len(rules) == 0 {
		return 0, "", false
	}
	now := timedPriceNow().In(timedPriceLocation)
	minute := now.Hour()*60 + now.Minute()
	for _, rule := range rules {
		for _, seg := range rule.normalizeSegments() {
			if minute >= seg[0] && minute < seg[1] {
				return rule.Ratio, rule.FormatTimedPriceWindow(), true
			}
		}
	}
	return 0, "", false
}
