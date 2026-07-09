package controller

import (
	"errors"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Admin-facing organization management. These endpoints sit behind AdminAuth
// (platform admin/root) and act on the organization *owned by* a target user,
// so they intentionally skip the org-scoped permission checks used by the
// self-service /api/org/* routes. They still reuse the same model-layer
// invariants (owner protection, cycle prevention, delete guards) so admin
// actions can never bypass those safety rules.

// resolveAdminTargetOrganization returns the organization owned by the user in
// the :id route param, or nil (with a handled 4xx response) when the user owns
// none.
func resolveAdminTargetOrganization(c *gin.Context) (*model.Organization, bool) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的用户 ID")
		return nil, false
	}
	org, err := model.GetOrganizationOwnedByUser(userId)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiErrorMsg(c, "该用户不拥有任何组织")
		return nil, false
	}
	if err != nil {
		common.ApiError(c, err)
		return nil, false
	}
	return org, true
}

func AdminUpdateOrganizationMember(c *gin.Context) {
	org, ok := resolveAdminTargetOrganization(c)
	if !ok {
		return
	}
	var payload organizationMemberUpdatePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		common.ApiError(c, err)
		return
	}
	payload.RoleKey = normalizeOrganizationRoleKey(payload.RoleKey)
	current, err := model.GetOrganizationMemberById(org.Id, payload.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if payload.RoleKey != current.RoleKey {
		if err := validateAssignableOrganizationRole(org.Id, payload.RoleKey); err != nil {
			common.ApiError(c, err)
			return
		}
	}
	member, err := model.UpdateOrganizationMember(org.Id, payload.Id, payload.RoleKey, payload.DepartmentId, current.Status)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildOrganizationMemberResponse(member, nil))
}

func AdminUpdateOrganizationMemberStatus(c *gin.Context) {
	org, ok := resolveAdminTargetOrganization(c)
	if !ok {
		return
	}
	memberId, err := strconv.Atoi(c.Param("member_id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的成员 ID")
		return
	}
	var payload organizationMemberStatusPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		common.ApiError(c, err)
		return
	}
	current, err := model.GetOrganizationMemberById(org.Id, memberId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	member, err := model.UpdateOrganizationMember(org.Id, memberId, current.RoleKey, current.DepartmentId, payload.Status)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildOrganizationMemberResponse(member, nil))
}

func AdminCreateOrganizationDepartment(c *gin.Context) {
	org, ok := resolveAdminTargetOrganization(c)
	if !ok {
		return
	}
	var payload organizationDepartmentPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		common.ApiError(c, err)
		return
	}
	department := &model.OrganizationDepartment{
		OrganizationId: org.Id,
		ParentId:       payload.ParentId,
		Name:           payload.Name,
		Sort:           payload.Sort,
	}
	if err := model.CreateOrganizationDepartment(department); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, department)
}

func AdminUpdateOrganizationDepartment(c *gin.Context) {
	org, ok := resolveAdminTargetOrganization(c)
	if !ok {
		return
	}
	var payload organizationDepartmentPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOrganizationDepartment(org.Id, payload.Id, payload.Name, payload.ParentId, payload.Sort); err != nil {
		common.ApiError(c, err)
		return
	}
	department, err := model.GetOrganizationDepartmentById(org.Id, payload.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, department)
}

func AdminDeleteOrganizationDepartment(c *gin.Context) {
	org, ok := resolveAdminTargetOrganization(c)
	if !ok {
		return
	}
	deptId, err := strconv.Atoi(c.Param("dept_id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的部门 ID")
		return
	}
	if err := model.DeleteOrganizationDepartment(org.Id, deptId); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// AdminGetOrganizationAssignableRoles returns the roles an admin can assign in
// the target user's organization (enabled, non-owner), so the /users edit UI
// can populate its role picker without a second self-scoped request.
func AdminGetOrganizationAssignableRoles(c *gin.Context) {
	org, ok := resolveAdminTargetOrganization(c)
	if !ok {
		return
	}
	roles, err := model.GetOrganizationRoles(org.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	responses := make([]organizationRoleResponse, 0, len(roles))
	for _, role := range roles {
		responses = append(responses, buildOrganizationRoleResponse(role))
	}
	common.ApiSuccess(c, gin.H{
		"organization": org,
		"roles":        responses,
	})
}
