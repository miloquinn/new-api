package service

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// 固定时钟 + 干净状态的测试夹具，测试结束后恢复真实时钟
func setupSmartRouterHealthTest(t *testing.T) *time.Time {
	t.Helper()
	current := time.Unix(1_700_000_000, 0)
	smartRouterHealthMu.Lock()
	smartRouterHealth = make(map[string]*smartRouterHealthEntry)
	smartRouterHealthMu.Unlock()
	smartRouterHealthNow = func() time.Time { return current }
	t.Cleanup(func() {
		smartRouterHealthNow = time.Now
		smartRouterHealthMu.Lock()
		smartRouterHealth = make(map[string]*smartRouterHealthEntry)
		smartRouterHealthMu.Unlock()
	})
	return &current
}

func TestSmartRouterDemotionThreshold(t *testing.T) {
	setupSmartRouterHealthTest(t)

	require.False(t, recordSmartRouterFailure("default", "m1"))
	assert.False(t, smartRouterCandidateDemoted("default", "m1"))
	require.False(t, recordSmartRouterFailure("default", "m1"))
	assert.False(t, smartRouterCandidateDemoted("default", "m1"))
	// 第三次连续失败触发降权，且返回 true（用于告警日志去重）
	require.True(t, recordSmartRouterFailure("default", "m1"))
	assert.True(t, smartRouterCandidateDemoted("default", "m1"))
	// 冷却期内的兜底流量失败：顺延冷却，但不再返回 true
	require.False(t, recordSmartRouterFailure("default", "m1"))
	assert.True(t, smartRouterCandidateDemoted("default", "m1"))
}

func TestSmartRouterDemotionExpiryAndReDemotion(t *testing.T) {
	current := setupSmartRouterHealthTest(t)

	for i := 0; i < smartRouterFailureThreshold; i++ {
		recordSmartRouterFailure("default", "m1")
	}
	require.True(t, smartRouterCandidateDemoted("default", "m1"))

	// 冷却期结束后自动放行（半开）
	*current = current.Add(smartRouterDemotionDuration + time.Second)
	assert.False(t, smartRouterCandidateDemoted("default", "m1"))

	// 探测流量再次失败：立即重新降权，且视为新的降权事件
	require.True(t, recordSmartRouterFailure("default", "m1"))
	assert.True(t, smartRouterCandidateDemoted("default", "m1"))
}

func TestSmartRouterSuccessResetsFailures(t *testing.T) {
	setupSmartRouterHealthTest(t)

	recordSmartRouterFailure("default", "m1")
	recordSmartRouterFailure("default", "m1")
	recordSmartRouterSuccess("default", "m1")
	// 成功清零后，需要重新累计满阈值才会降权
	require.False(t, recordSmartRouterFailure("default", "m1"))
	require.False(t, recordSmartRouterFailure("default", "m1"))
	assert.False(t, smartRouterCandidateDemoted("default", "m1"))
	require.True(t, recordSmartRouterFailure("default", "m1"))
	assert.True(t, smartRouterCandidateDemoted("default", "m1"))
}

func TestSmartRouterStaleFailuresReset(t *testing.T) {
	current := setupSmartRouterHealthTest(t)

	recordSmartRouterFailure("default", "m1")
	recordSmartRouterFailure("default", "m1")
	// 距上次失败超过陈旧窗口，计数重新开始
	*current = current.Add(smartRouterFailureStaleAfter + time.Second)
	require.False(t, recordSmartRouterFailure("default", "m1"))
	assert.False(t, smartRouterCandidateDemoted("default", "m1"))
}

func TestSmartRouterDemotionIsolatedByGroup(t *testing.T) {
	setupSmartRouterHealthTest(t)

	for i := 0; i < smartRouterFailureThreshold; i++ {
		recordSmartRouterFailure("vip", "m1")
	}
	assert.True(t, smartRouterCandidateDemoted("vip", "m1"))
	assert.False(t, smartRouterCandidateDemoted("default", "m1"))
	assert.False(t, smartRouterCandidateDemoted("vip", "m2"))
}

// RecordSmartRouterResult 的状态码分类契约：2xx/3xx 成功清零，429/5xx 计失败，
// 其余 4xx 不影响健康状态。
func TestRecordSmartRouterResultStatusClassification(t *testing.T) {
	setupSmartRouterHealthTest(t)
	gin.SetMode(gin.TestMode)

	newCtx := func(status int) *gin.Context {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
		common.SetContextKey(c, constant.ContextKeySmartRouter, "auto-cheap")
		common.SetContextKey(c, constant.ContextKeyUsingGroup, "default")
		c.Status(status)
		return c
	}

	// 5xx 计失败
	for i := 0; i < smartRouterFailureThreshold; i++ {
		RecordSmartRouterResult(newCtx(502), "m1")
	}
	require.True(t, smartRouterCandidateDemoted("default", "m1"))

	// 客户端 4xx（非 429）不计失败
	for i := 0; i < smartRouterFailureThreshold; i++ {
		RecordSmartRouterResult(newCtx(400), "m2")
	}
	assert.False(t, smartRouterCandidateDemoted("default", "m2"))

	// 429 计失败
	for i := 0; i < smartRouterFailureThreshold; i++ {
		RecordSmartRouterResult(newCtx(429), "m3")
	}
	assert.True(t, smartRouterCandidateDemoted("default", "m3"))

	// 成功清零：已累计 2 次失败后一次 200，重新累计 2 次也不降权
	RecordSmartRouterResult(newCtx(500), "m4")
	RecordSmartRouterResult(newCtx(500), "m4")
	RecordSmartRouterResult(newCtx(200), "m4")
	RecordSmartRouterResult(newCtx(500), "m4")
	RecordSmartRouterResult(newCtx(500), "m4")
	assert.False(t, smartRouterCandidateDemoted("default", "m4"))

	// 未经过智能路由解析的请求不记录
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
	c.Status(500)
	for i := 0; i < smartRouterFailureThreshold; i++ {
		RecordSmartRouterResult(c, "m5")
	}
	assert.False(t, smartRouterCandidateDemoted("", "m5"))
}
