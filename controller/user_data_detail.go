package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/orgauth"

	"github.com/gin-gonic/gin"
)

// canViewUserData decides whether a caller may view a target user's usage.
// Platform admins/root see everyone; anyone can see themselves; otherwise the
// target must appear in the caller's resolved organization usage scope. Kept
// as a pure function so the authorization rule is unit-testable without a full
// gin context.
func canViewUserData(callerRole int, callerId int, targetUserId int, scopeUserIds []int) bool {
	if callerRole >= common.RoleAdminUser {
		return true
	}
	if targetUserId == callerId {
		return true
	}
	for _, uid := range scopeUserIds {
		if uid == targetUserId {
			return true
		}
	}
	return false
}

// GetUserQuotaDetail returns per-model usage for a single target user over a
// time window, gated by who is allowed to see that user:
//
//   - platform admin/root -> any user
//   - otherwise            -> the target must fall inside the caller's
//     organization usage scope (own / department subtree / whole org),
//     reusing the exact same resolver as the org usage view so visibility can
//     never drift between the two surfaces.
//
// A caller can always see their own data even without an organization.
func GetUserQuotaDetail(c *gin.Context) {
	targetUserId, err := strconv.Atoi(c.Param("id"))
	if err != nil || targetUserId <= 0 {
		common.ApiErrorMsg(c, "无效的用户 ID")
		return
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	// Cap the window to one month to match the self-service usage endpoints and
	// keep aggregate scans bounded.
	if endTimestamp-startTimestamp > 2592000 {
		common.ApiErrorMsg(c, "时间跨度不能超过 1 个月")
		return
	}

	callerId := c.GetInt("id")
	callerRole := c.GetInt("role")

	// Admins and self-access skip the (more expensive) scope resolution.
	var scopeUserIds []int
	if callerRole < common.RoleAdminUser && targetUserId != callerId {
		scope, err := resolveOrganizationDataScope(c, orgauth.ResourceUsage, "read_organization", "read_department")
		if err != nil {
			common.ApiError(c, err)
			return
		}
		scopeUserIds = scope.userIds
	}

	if !canViewUserData(callerRole, callerId, targetUserId, scopeUserIds) {
		c.JSON(403, gin.H{"success": false, "message": "无权查看该用户的数据"})
		return
	}

	targetUser, err := model.GetUserById(targetUserId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	quotaData, err := model.GetQuotaDataByUserId(targetUserId, startTimestamp, endTimestamp)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"user": gin.H{
			"id":            targetUser.Id,
			"username":      targetUser.Username,
			"display_name":  targetUser.DisplayName,
			"quota":         targetUser.Quota,
			"used_quota":    targetUser.UsedQuota,
			"request_count": targetUser.RequestCount,
		},
		"items": quotaData,
	})
}
