package controller

import (
	"errors"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/orgauth"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type organizationDepartmentPayload struct {
	Id       int    `json:"id"`
	Name     string `json:"name"`
	ParentId int    `json:"parent_id"`
	Sort     int    `json:"sort"`
}

type organizationMemberUpdatePayload struct {
	Id           int    `json:"id"`
	RoleKey      string `json:"role_key"`
	DepartmentId int    `json:"department_id"`
}

type organizationMemberStatusPayload struct {
	Status int `json:"status"`
}

func GetOrganizationDepartments(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationPermission(c, org.Id, orgauth.ResourceDepartments, "read") {
		return
	}
	departments, err := model.GetOrganizationDepartments(org.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	memberCounts, err := model.CountOrganizationDepartmentMembers(org.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"organization":  org,
		"departments":   departments,
		"member_counts": memberCounts,
	})
}

func CreateOrganizationDepartment(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationPermission(c, org.Id, orgauth.ResourceDepartments, "create") {
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

func UpdateOrganizationDepartment(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationPermission(c, org.Id, orgauth.ResourceDepartments, "update") {
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

func DeleteOrganizationDepartment(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationPermission(c, org.Id, orgauth.ResourceDepartments, "delete") {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的部门 ID")
		return
	}
	if err := model.DeleteOrganizationDepartment(org.Id, id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func UpdateOrganizationMemberAssignment(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationPermission(c, org.Id, orgauth.ResourceMembers, "update") {
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
	// Role validation only applies to actual role changes; the owner role is
	// not assignable but must survive department-only updates untouched.
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

func UpdateOrganizationMemberStatus(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationPermission(c, org.Id, orgauth.ResourceMembers, "disable") {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的成员 ID")
		return
	}
	var payload organizationMemberStatusPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		common.ApiError(c, err)
		return
	}
	current, err := model.GetOrganizationMemberById(org.Id, id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	member, err := model.UpdateOrganizationMember(org.Id, id, current.RoleKey, current.DepartmentId, payload.Status)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildOrganizationMemberResponse(member, nil))
}

func ResetOrganizationMemberPassword(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationPermission(c, org.Id, orgauth.ResourceMembers, "reset_password") {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的成员 ID")
		return
	}
	member, err := model.GetOrganizationMemberById(org.Id, id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	// The owner's credentials must never be resettable by other members, and
	// organization-scoped permissions must not reach platform-privileged
	// accounts — both would be account-takeover escalations.
	if member.UserId == org.OwnerUserId {
		common.ApiErrorMsg(c, "不能重置组织所有者的密码")
		return
	}
	user, err := model.GetUserById(member.UserId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if user.Role >= common.RoleAdminUser {
		common.ApiErrorMsg(c, "不能重置平台管理员账号的密码")
		return
	}
	newPassword, err := common.GenerateRandomCharsKey(12)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	hashedPassword, err := common.Password2Hash(newPassword)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", member.UserId).
		Update("password", hashedPassword).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"member":           buildOrganizationMemberResponse(member, user),
		"initial_password": newPassword,
	})
}

// GetUserOrganizationStructure is the admin-only read model behind the users
// table row expansion: the organization the user owns (departments + members)
// plus the user's own membership, if any.
func GetUserOrganizationStructure(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的用户 ID")
		return
	}

	response := gin.H{
		"organization":  nil,
		"departments":   []*model.OrganizationDepartment{},
		"members":       []organizationMemberResponse{},
		"member_counts": map[int]int64{},
		"membership":    nil,
	}

	org, err := model.GetOrganizationOwnedByUser(userId)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiError(c, err)
		return
	}
	if err == nil {
		departments, err := model.GetOrganizationDepartments(org.Id)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		memberCounts, err := model.CountOrganizationDepartmentMembers(org.Id)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		members, err := model.GetOrganizationMembers(org.Id)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		userIds := make([]int, 0, len(members))
		for _, member := range members {
			userIds = append(userIds, member.UserId)
		}
		usersById, err := model.GetUsersByIds(userIds)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		memberResponses := make([]organizationMemberResponse, 0, len(members))
		for _, member := range members {
			memberResponses = append(memberResponses, buildOrganizationMemberResponse(member, usersById[member.UserId]))
		}
		response["organization"] = org
		response["departments"] = departments
		response["members"] = memberResponses
		response["member_counts"] = memberCounts
	}

	membership, err := model.GetOrganizationMembershipOfUser(userId)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiError(c, err)
		return
	}
	if err == nil {
		membershipInfo := gin.H{
			"organization_id": membership.OrganizationId,
			"role_key":        membership.RoleKey,
			"department_id":   membership.DepartmentId,
		}
		var memberOrg model.Organization
		if err := model.DB.First(&memberOrg, "id = ?", membership.OrganizationId).Error; err == nil {
			membershipInfo["organization_name"] = memberOrg.Name
		}
		if membership.DepartmentId != 0 {
			if dept, deptErr := model.GetOrganizationDepartmentById(membership.OrganizationId, membership.DepartmentId); deptErr == nil {
				membershipInfo["department_name"] = dept.Name
			}
		}
		response["membership"] = membershipInfo
	}

	common.ApiSuccess(c, response)
}
