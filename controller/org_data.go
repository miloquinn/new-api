package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/orgauth"

	"github.com/gin-gonic/gin"
)

// Organization-scoped data views (usage analytics, request logs). The visible
// user_id set is computed entirely on the server from the caller's org role,
// never from client input, so a member can never widen their own scope:
//
//   - *_organization permission  -> all enabled members of the organization
//   - *_department permission     -> members of the caller's department subtree
//   - otherwise (read_own only)   -> just the caller
//
// The narrowest matching scope wins for safety: an org-wide grant is required
// to see the whole organization; a department grant only unlocks the caller's
// own department branch.

type organizationDataScope struct {
	orgId   int
	userIds []int
	// level is "organization", "department", or "own" — surfaced to the client
	// so the UI can label the view without re-deriving permissions.
	level string
}

// resolveOrganizationDataScope determines which user ids the caller may see for
// a given resource. `orgAction` / `deptAction` are the permission actions that
// unlock organization-wide and department-wide visibility for that resource
// (e.g. "read_organization" / "read_department").
func resolveOrganizationDataScope(c *gin.Context, resource string, orgAction string, deptAction string) (*organizationDataScope, error) {
	org, err := currentOrganization(c)
	if err != nil {
		return nil, err
	}
	userId := c.GetInt("id")
	member, err := model.GetOrganizationMember(org.Id, userId)
	if err != nil {
		return nil, err
	}

	if canUseOrganizationPermission(c, org.Id, resource, orgAction) {
		userIds, err := model.GetOrganizationMemberUserIds(org.Id, nil)
		if err != nil {
			return nil, err
		}
		return &organizationDataScope{orgId: org.Id, userIds: userIds, level: "organization"}, nil
	}

	if canUseOrganizationPermission(c, org.Id, resource, deptAction) {
		if member.DepartmentId == 0 {
			// A department-scoped viewer with no department can only see
			// themselves; there is no department branch to expand.
			return &organizationDataScope{orgId: org.Id, userIds: []int{userId}, level: "own"}, nil
		}
		deptIds, err := model.CollectDepartmentSubtreeIds(org.Id, member.DepartmentId)
		if err != nil {
			return nil, err
		}
		userIds, err := model.GetOrganizationMemberUserIds(org.Id, deptIds)
		if err != nil {
			return nil, err
		}
		return &organizationDataScope{orgId: org.Id, userIds: userIds, level: "department"}, nil
	}

	return &organizationDataScope{orgId: org.Id, userIds: []int{userId}, level: "own"}, nil
}

func GetOrganizationUsage(c *gin.Context) {
	scope, err := resolveOrganizationDataScope(c, orgauth.ResourceUsage, "read_organization", "read_department")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	byMember := c.Query("by_member") == "true"
	// Per-member breakdowns require the by_member permission; without it the
	// data is aggregated so individual members are not singled out.
	if byMember && !canUseOrganizationPermission(c, scope.orgId, orgauth.ResourceUsage, "by_member") {
		byMember = false
	}
	quotaData, err := model.GetQuotaDataByUserIds(scope.userIds, startTimestamp, endTimestamp, byMember)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"scope": scope.level,
		"items": quotaData,
	})
}

func GetOrganizationLogs(c *gin.Context) {
	scope, err := resolveOrganizationDataScope(c, orgauth.ResourceLogs, "read_organization", "read_department")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo := common.GetPageQuery(c)
	logType, _ := strconv.Atoi(c.Query("type"))
	startTimestamp, _ := strconv.ParseInt(c.Query("start_timestamp"), 10, 64)
	endTimestamp, _ := strconv.ParseInt(c.Query("end_timestamp"), 10, 64)
	tokenName := c.Query("token_name")
	modelName := c.Query("model_name")
	group := c.Query("group")

	logs, total, err := model.GetLogsByUserIds(
		scope.userIds,
		logType,
		startTimestamp,
		endTimestamp,
		modelName,
		tokenName,
		pageInfo.GetStartIdx(),
		pageInfo.GetPageSize(),
		group,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(gin.H{
		"scope": scope.level,
		"logs":  logs,
	})
	common.ApiSuccess(c, pageInfo)
}
