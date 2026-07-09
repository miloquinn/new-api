package controller

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/orgauth"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var organizationRoleKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{1,62}$`)

type organizationRolePayload struct {
	Id          int                      `json:"id"`
	Key         string                   `json:"key"`
	Name        string                   `json:"name"`
	Description string                   `json:"description"`
	Permissions orgauth.PermissionMatrix `json:"permissions"`
	Enabled     *bool                    `json:"enabled"`
	Sort        int                      `json:"sort"`
}

type organizationRoleResponse struct {
	Id             int                      `json:"id"`
	OrganizationId int                      `json:"organization_id"`
	Key            string                   `json:"key"`
	Name           string                   `json:"name"`
	Description    string                   `json:"description"`
	Permissions    orgauth.PermissionMatrix `json:"permissions"`
	BuiltIn        bool                     `json:"built_in"`
	Enabled        bool                     `json:"enabled"`
	Sort           int                      `json:"sort"`
	CreatedAt      int64                    `json:"created_at"`
	UpdatedAt      int64                    `json:"updated_at"`
}

type organizationMemberResponse struct {
	Id             int         `json:"id"`
	OrganizationId int         `json:"organization_id"`
	UserId         int         `json:"user_id"`
	RoleKey        string      `json:"role_key"`
	DepartmentId   int         `json:"department_id"`
	Status         int         `json:"status"`
	User           interface{} `json:"user,omitempty"`
	CreatedAt      int64       `json:"created_at"`
	UpdatedAt      int64       `json:"updated_at"`
}

type organizationInvitationPayload struct {
	Email         string `json:"email"`
	RoleKey       string `json:"role_key"`
	DepartmentId  int    `json:"department_id"`
	ExpiresInDays int    `json:"expires_in_days"`
}

type organizationInvitationResponse struct {
	Id               int    `json:"id"`
	OrganizationId   int    `json:"organization_id"`
	Email            string `json:"email"`
	RoleKey          string `json:"role_key"`
	DepartmentId     int    `json:"department_id"`
	Status           int    `json:"status"`
	InvitedByUserId  int    `json:"invited_by_user_id"`
	AcceptedByUserId int    `json:"accepted_by_user_id"`
	ExpiresAt        int64  `json:"expires_at"`
	AcceptedAt       int64  `json:"accepted_at"`
	CreatedAt        int64  `json:"created_at"`
	UpdatedAt        int64  `json:"updated_at"`
	Token            string `json:"token,omitempty"`
}

type organizationInvitationAcceptPayload struct {
	Token string `json:"token"`
}

type organizationMemberCreatePayload struct {
	Username     string `json:"username"`
	Password     string `json:"password"`
	DisplayName  string `json:"display_name"`
	Email        string `json:"email"`
	RoleKey      string `json:"role_key"`
	DepartmentId int    `json:"department_id"`
}

func organizationRoleTemplates() []model.OrganizationRoleTemplate {
	templates := orgauth.DefaultRoleTemplates()
	result := make([]model.OrganizationRoleTemplate, 0, len(templates))
	for _, template := range templates {
		result = append(result, model.OrganizationRoleTemplate{
			Key:         template.Key,
			Name:        template.Name,
			Description: template.Description,
			Permissions: template.Permissions,
		})
	}
	return result
}

func currentOrganization(c *gin.Context) (*model.Organization, error) {
	org, err := model.EnsureDefaultOrganizationForUser(c.GetInt("id"), c.GetString("username"))
	if err != nil {
		return nil, err
	}
	if err := model.SeedOrganizationRoleTemplates(org.Id, organizationRoleTemplates()); err != nil {
		return nil, err
	}
	return org, nil
}

func canManageOrganizationRole(c *gin.Context, orgId int, action string) bool {
	return canUseOrganizationPermission(c, orgId, orgauth.ResourceRoles, action)
}

func canUseOrganizationPermission(c *gin.Context, orgId int, resource string, action string) bool {
	member, err := model.GetOrganizationMember(orgId, c.GetInt("id"))
	if err != nil {
		return false
	}
	if member.RoleKey == model.OrganizationRoleOwner {
		return true
	}
	role, err := model.GetOrganizationRoleByKey(orgId, member.RoleKey)
	if err != nil || !role.Enabled {
		return false
	}
	permissions := model.ParseOrganizationPermissions(role.Permissions)
	return permissions[resource][action]
}

func requireOrganizationRolePermission(c *gin.Context, orgId int, action string) bool {
	return requireOrganizationPermission(c, orgId, orgauth.ResourceRoles, action)
}

func requireOrganizationPermission(c *gin.Context, orgId int, resource string, action string) bool {
	if canUseOrganizationPermission(c, orgId, resource, action) {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{
		"success": false,
		"message": "权限不足",
	})
	return false
}

func normalizeOrganizationRolePayload(payload organizationRolePayload) organizationRolePayload {
	payload.Key = strings.ToLower(strings.TrimSpace(payload.Key))
	payload.Name = strings.TrimSpace(payload.Name)
	payload.Description = strings.TrimSpace(payload.Description)
	payload.Permissions = orgauth.NormalizePermissions(payload.Permissions)
	return payload
}

func validateOrganizationRolePayload(payload organizationRolePayload) error {
	if !organizationRoleKeyPattern.MatchString(payload.Key) {
		return errors.New("角色标识只能包含小写字母、数字和下划线，并且必须以字母开头")
	}
	if payload.Name == "" {
		return errors.New("角色名称不能为空")
	}
	if len(payload.Name) > 100 {
		return errors.New("角色名称不能超过 100 个字符")
	}
	if len(payload.Description) > 1000 {
		return errors.New("角色说明不能超过 1000 个字符")
	}
	return nil
}

func normalizeOrganizationRoleKey(roleKey string) string {
	return strings.ToLower(strings.TrimSpace(roleKey))
}

func validateAssignableOrganizationRole(orgId int, roleKey string) error {
	if roleKey == "" {
		return errors.New("角色不能为空")
	}
	if roleKey == model.OrganizationRoleOwner {
		return errors.New("不能分配组织所有者角色")
	}
	role, err := model.GetOrganizationRoleByKey(orgId, roleKey)
	if err != nil {
		return err
	}
	if !role.Enabled {
		return errors.New("角色已停用")
	}
	return nil
}

func buildOrganizationRoleResponse(role *model.OrganizationRole) organizationRoleResponse {
	return organizationRoleResponse{
		Id:             role.Id,
		OrganizationId: role.OrganizationId,
		Key:            role.Key,
		Name:           role.Name,
		Description:    role.Description,
		Permissions:    model.ParseOrganizationPermissions(role.Permissions),
		BuiltIn:        role.BuiltIn,
		Enabled:        role.Enabled,
		Sort:           role.Sort,
		CreatedAt:      role.CreatedAt,
		UpdatedAt:      role.UpdatedAt,
	}
}

func buildOrganizationMemberResponse(member *model.OrganizationMember, user *model.User) organizationMemberResponse {
	var userData interface{}
	if user != nil {
		userData = gin.H{
			"id":           user.Id,
			"username":     user.Username,
			"display_name": user.DisplayName,
			"email":        user.Email,
			"status":       user.Status,
		}
	}
	return organizationMemberResponse{
		Id:             member.Id,
		OrganizationId: member.OrganizationId,
		UserId:         member.UserId,
		RoleKey:        member.RoleKey,
		DepartmentId:   member.DepartmentId,
		Status:         member.Status,
		User:           userData,
		CreatedAt:      member.CreatedAt,
		UpdatedAt:      member.UpdatedAt,
	}
}

func buildOrganizationInvitationResponse(invitation *model.OrganizationInvitation, token string) organizationInvitationResponse {
	return organizationInvitationResponse{
		Id:               invitation.Id,
		OrganizationId:   invitation.OrganizationId,
		Email:            invitation.Email,
		RoleKey:          invitation.RoleKey,
		DepartmentId:     invitation.DepartmentId,
		Status:           invitation.Status,
		InvitedByUserId:  invitation.InvitedByUserId,
		AcceptedByUserId: invitation.AcceptedByUserId,
		ExpiresAt:        invitation.ExpiresAt,
		AcceptedAt:       invitation.AcceptedAt,
		CreatedAt:        invitation.CreatedAt,
		UpdatedAt:        invitation.UpdatedAt,
		Token:            token,
	}
}

func GetOrganizationPermissionCatalog(c *gin.Context) {
	templates := orgauth.DefaultRoleTemplates()
	common.ApiSuccess(c, gin.H{
		"resources": orgauth.Catalog(),
		"templates": templates,
	})
}

func GetOrganizationMembers(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationPermission(c, org.Id, orgauth.ResourceMembers, "read") {
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
	responses := make([]organizationMemberResponse, 0, len(members))
	for _, member := range members {
		responses = append(responses, buildOrganizationMemberResponse(member, usersById[member.UserId]))
	}
	common.ApiSuccess(c, gin.H{
		"organization": org,
		"members":      responses,
	})
}

func CreateOrganizationInvitation(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationPermission(c, org.Id, orgauth.ResourceMembers, "create") {
		return
	}
	var payload organizationInvitationPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		common.ApiError(c, err)
		return
	}
	payload.Email = model.NormalizeEmail(payload.Email)
	payload.RoleKey = normalizeOrganizationRoleKey(payload.RoleKey)
	if err := validateAssignableOrganizationRole(org.Id, payload.RoleKey); err != nil {
		common.ApiError(c, err)
		return
	}
	expiresInDays := payload.ExpiresInDays
	if expiresInDays <= 0 {
		expiresInDays = 7
	}
	if expiresInDays > 90 {
		expiresInDays = 90
	}
	token, err := common.GenerateRandomKey(48)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	invitation := &model.OrganizationInvitation{
		OrganizationId:  org.Id,
		Email:           payload.Email,
		RoleKey:         payload.RoleKey,
		DepartmentId:    payload.DepartmentId,
		InvitedByUserId: c.GetInt("id"),
		ExpiresAt:       common.GetTimestamp() + int64(expiresInDays)*24*60*60,
	}
	if err := model.CreateOrganizationInvitation(invitation, token); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildOrganizationInvitationResponse(invitation, token))
}

func GetOrganizationInvitations(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationPermission(c, org.Id, orgauth.ResourceMembers, "read") {
		return
	}
	invitations, err := model.GetOrganizationInvitations(org.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	responses := make([]organizationInvitationResponse, 0, len(invitations))
	for _, invitation := range invitations {
		responses = append(responses, buildOrganizationInvitationResponse(invitation, ""))
	}
	common.ApiSuccess(c, gin.H{
		"organization": org,
		"invitations":  responses,
	})
}

func RevokeOrganizationInvitation(c *gin.Context) {
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
		common.ApiError(c, err)
		return
	}
	if err := model.RevokeOrganizationInvitation(org.Id, id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AcceptOrganizationInvitation(c *gin.Context) {
	var payload organizationInvitationAcceptPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		common.ApiError(c, err)
		return
	}
	member, err := model.AcceptOrganizationInvitation(payload.Token, c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildOrganizationMemberResponse(member, nil))
}

func CreateOrganizationMemberAccount(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationPermission(c, org.Id, orgauth.ResourceMembers, "create") {
		return
	}
	var payload organizationMemberCreatePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		common.ApiError(c, err)
		return
	}
	payload.Username = strings.TrimSpace(payload.Username)
	payload.DisplayName = strings.TrimSpace(payload.DisplayName)
	payload.Email = model.NormalizeEmail(payload.Email)
	payload.RoleKey = normalizeOrganizationRoleKey(payload.RoleKey)
	if payload.DisplayName == "" {
		payload.DisplayName = payload.Username
	}
	if err := validateAssignableOrganizationRole(org.Id, payload.RoleKey); err != nil {
		common.ApiError(c, err)
		return
	}
	generatedPassword := ""
	if strings.TrimSpace(payload.Password) == "" {
		generatedPassword, err = common.GenerateRandomCharsKey(12)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		payload.Password = generatedPassword
	}
	exist, err := model.CheckUserExistOrDeleted(payload.Username, payload.Email)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if exist {
		common.ApiErrorMsg(c, "用户已存在")
		return
	}
	user := &model.User{
		Username:    payload.Username,
		Password:    payload.Password,
		DisplayName: payload.DisplayName,
		Email:       payload.Email,
		Role:        common.RoleCommonUser,
	}
	if err := common.Validate.Struct(user); err != nil {
		common.ApiError(c, err)
		return
	}
	var member *model.OrganizationMember
	if err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := user.InsertWithTx(tx, 0); err != nil {
			return err
		}
		member, err = model.AddOrganizationMember(tx, org.Id, user.Id, payload.RoleKey, payload.DepartmentId)
		return err
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	user.FinishInsert(0)
	response := gin.H{
		"member": buildOrganizationMemberResponse(member, user),
	}
	if generatedPassword != "" {
		response["initial_password"] = generatedPassword
	}
	common.ApiSuccess(c, response)
}

func GetOrganizationRoles(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationRolePermission(c, org.Id, "read") {
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

func GetOrganizationRole(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationRolePermission(c, org.Id, "read") {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	role, err := model.GetOrganizationRoleById(org.Id, id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildOrganizationRoleResponse(role))
}

func CreateOrganizationRole(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationRolePermission(c, org.Id, "create") {
		return
	}
	var payload organizationRolePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		common.ApiError(c, err)
		return
	}
	payload = normalizeOrganizationRolePayload(payload)
	if err := validateOrganizationRolePayload(payload); err != nil {
		common.ApiError(c, err)
		return
	}
	duplicated, err := model.IsOrganizationRoleKeyDuplicated(org.Id, 0, payload.Key)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if duplicated {
		common.ApiErrorMsg(c, "角色标识已存在")
		return
	}
	enabled := true
	if payload.Enabled != nil {
		enabled = *payload.Enabled
	}
	role := &model.OrganizationRole{
		OrganizationId: org.Id,
		Key:            payload.Key,
		Name:           payload.Name,
		Description:    payload.Description,
		Enabled:        enabled,
		Sort:           payload.Sort,
	}
	if err := model.CreateOrganizationRole(role, payload.Permissions); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildOrganizationRoleResponse(role))
}

func UpdateOrganizationRole(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationRolePermission(c, org.Id, "update") {
		return
	}
	var payload organizationRolePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		common.ApiError(c, err)
		return
	}
	payload = normalizeOrganizationRolePayload(payload)
	if payload.Id == 0 {
		common.ApiErrorMsg(c, "缺少角色 ID")
		return
	}
	if err := validateOrganizationRolePayload(payload); err != nil {
		common.ApiError(c, err)
		return
	}
	existing, err := model.GetOrganizationRoleById(org.Id, payload.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if existing.BuiltIn && existing.Key != payload.Key {
		common.ApiErrorMsg(c, "内置角色不能修改标识")
		return
	}
	duplicated, err := model.IsOrganizationRoleKeyDuplicated(org.Id, payload.Id, payload.Key)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if duplicated {
		common.ApiErrorMsg(c, "角色标识已存在")
		return
	}
	enabled := true
	if payload.Enabled != nil {
		enabled = *payload.Enabled
	} else if existing.Id != 0 {
		enabled = existing.Enabled
	}
	role := &model.OrganizationRole{
		Id:             payload.Id,
		OrganizationId: org.Id,
		Key:            payload.Key,
		Name:           payload.Name,
		Description:    payload.Description,
		Enabled:        enabled,
		Sort:           payload.Sort,
	}
	if err := model.UpdateOrganizationRole(role, payload.Permissions); err != nil {
		common.ApiError(c, err)
		return
	}
	updated, err := model.GetOrganizationRoleById(org.Id, payload.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, buildOrganizationRoleResponse(updated))
}

func DeleteOrganizationRole(c *gin.Context) {
	org, err := currentOrganization(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !requireOrganizationRolePermission(c, org.Id, "delete") {
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteOrganizationRole(org.Id, id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorMsg(c, "角色不存在")
			return
		}
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
