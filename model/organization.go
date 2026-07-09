package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service/orgauth"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	OrganizationStatusEnabled  = 1
	OrganizationStatusDisabled = 2

	OrganizationMemberStatusEnabled  = 1
	OrganizationMemberStatusDisabled = 2

	OrganizationInvitationStatusPending  = 1
	OrganizationInvitationStatusAccepted = 2
	OrganizationInvitationStatusExpired  = 3
	OrganizationInvitationStatusRevoked  = 4

	OrganizationDepartmentStatusEnabled = 1

	OrganizationRoleOwner = "owner"
)

type Organization struct {
	Id          int    `json:"id"`
	Name        string `json:"name" gorm:"size:100;not null;index"`
	OwnerUserId int    `json:"owner_user_id" gorm:"index;not null"`
	Status      int    `json:"status" gorm:"type:int;default:1"`
	CreatedAt   int64  `json:"created_at" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt   int64  `json:"updated_at" gorm:"autoUpdateTime;column:updated_at"`
}

type OrganizationMember struct {
	Id             int    `json:"id"`
	OrganizationId int    `json:"organization_id" gorm:"uniqueIndex:idx_org_member_user;index;not null"`
	UserId         int    `json:"user_id" gorm:"uniqueIndex:idx_org_member_user;index;not null"`
	RoleKey        string `json:"role_key" gorm:"size:64;index;not null"`
	DepartmentId   int    `json:"department_id" gorm:"index;default:0"`
	Status         int    `json:"status" gorm:"type:int;default:1"`
	CreatedAt      int64  `json:"created_at" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt      int64  `json:"updated_at" gorm:"autoUpdateTime;column:updated_at"`
}

// OrganizationDepartment is a node of the organization's department tree.
// ParentId = 0 marks a top-level department; nesting depth is unrestricted.
type OrganizationDepartment struct {
	Id             int    `json:"id"`
	OrganizationId int    `json:"organization_id" gorm:"index;not null"`
	ParentId       int    `json:"parent_id" gorm:"index;default:0"`
	Name           string `json:"name" gorm:"size:100;not null"`
	Sort           int    `json:"sort" gorm:"default:0"`
	Status         int    `json:"status" gorm:"type:int;default:1"`
	CreatedAt      int64  `json:"created_at" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt      int64  `json:"updated_at" gorm:"autoUpdateTime;column:updated_at"`
}

type OrganizationInvitation struct {
	Id               int    `json:"id"`
	OrganizationId   int    `json:"organization_id" gorm:"index;not null"`
	Email            string `json:"email" gorm:"size:100;index;default:''"`
	RoleKey          string `json:"role_key" gorm:"size:64;index;not null"`
	DepartmentId     int    `json:"department_id" gorm:"index;default:0"`
	TokenHash        string `json:"-" gorm:"size:64;uniqueIndex;not null"`
	Status           int    `json:"status" gorm:"type:int;default:1;index"`
	InvitedByUserId  int    `json:"invited_by_user_id" gorm:"index;not null"`
	AcceptedByUserId int    `json:"accepted_by_user_id" gorm:"index;default:0"`
	ExpiresAt        int64  `json:"expires_at" gorm:"index"`
	AcceptedAt       int64  `json:"accepted_at" gorm:"default:0"`
	CreatedAt        int64  `json:"created_at" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt        int64  `json:"updated_at" gorm:"autoUpdateTime;column:updated_at"`
}

type OrganizationRole struct {
	Id             int    `json:"id"`
	OrganizationId int    `json:"organization_id" gorm:"uniqueIndex:idx_org_role_key;index;not null"`
	Key            string `json:"key" gorm:"size:64;uniqueIndex:idx_org_role_key;not null"`
	Name           string `json:"name" gorm:"size:100;not null"`
	Description    string `json:"description" gorm:"type:text"`
	Permissions    string `json:"permissions" gorm:"type:text"`
	BuiltIn        bool   `json:"built_in"`
	Enabled        bool   `json:"enabled"`
	Sort           int    `json:"sort"`
	CreatedAt      int64  `json:"created_at" gorm:"autoCreateTime;column:created_at"`
	UpdatedAt      int64  `json:"updated_at" gorm:"autoUpdateTime;column:updated_at"`
}

type OrganizationRoleTemplate struct {
	Key         string
	Name        string
	Description string
	Permissions orgauth.PermissionMatrix
}

func EnsureDefaultOrganizationForUser(userId int, username string) (*Organization, error) {
	if userId == 0 {
		return nil, errors.New("user id is required")
	}
	var org Organization
	err := DB.Transaction(func(tx *gorm.DB) error {
		var member OrganizationMember
		err := tx.Where("user_id = ? AND status = ?", userId, OrganizationMemberStatusEnabled).
			Order("id asc").
			First(&member).Error
		if err == nil {
			return tx.First(&org, "id = ?", member.OrganizationId).Error
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		orgName := strings.TrimSpace(username)
		if orgName == "" {
			orgName = fmt.Sprintf("User %d", userId)
		}
		org = Organization{
			Name:        orgName + "'s Organization",
			OwnerUserId: userId,
			Status:      OrganizationStatusEnabled,
		}
		if err := tx.Create(&org).Error; err != nil {
			return err
		}
		member = OrganizationMember{
			OrganizationId: org.Id,
			UserId:         userId,
			RoleKey:        OrganizationRoleOwner,
			Status:         OrganizationMemberStatusEnabled,
		}
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&member).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &org, nil
}

func SeedOrganizationRoleTemplates(orgId int, templates []OrganizationRoleTemplate) error {
	if orgId == 0 {
		return errors.New("organization id is required")
	}
	for idx, template := range templates {
		permissions, err := marshalOrganizationPermissions(template.Permissions)
		if err != nil {
			return err
		}
		role := OrganizationRole{
			OrganizationId: orgId,
			Key:            template.Key,
			Name:           template.Name,
			Description:    template.Description,
			Permissions:    permissions,
			BuiltIn:        true,
			Enabled:        true,
			Sort:           idx * 10,
		}
		if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&role).Error; err != nil {
			return err
		}
	}
	return nil
}

func GetOrganizationMember(orgId int, userId int) (*OrganizationMember, error) {
	var member OrganizationMember
	err := DB.Where("organization_id = ? AND user_id = ? AND status = ?", orgId, userId, OrganizationMemberStatusEnabled).
		First(&member).Error
	return &member, err
}

func GetOrganizationMembers(orgId int) ([]*OrganizationMember, error) {
	var members []*OrganizationMember
	err := DB.Where("organization_id = ?", orgId).
		Order("id asc").
		Find(&members).Error
	return members, err
}

func AddOrganizationMember(tx *gorm.DB, orgId int, userId int, roleKey string, departmentId int) (*OrganizationMember, error) {
	if tx == nil {
		tx = DB
	}
	if orgId == 0 || userId == 0 || roleKey == "" {
		return nil, errors.New("organization id, user id, and role key are required")
	}
	member := OrganizationMember{
		OrganizationId: orgId,
		UserId:         userId,
		RoleKey:        roleKey,
		DepartmentId:   departmentId,
		Status:         OrganizationMemberStatusEnabled,
	}
	err := tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{
			{Name: "organization_id"},
			{Name: "user_id"},
		},
		DoUpdates: clause.Assignments(map[string]interface{}{
			"role_key":      roleKey,
			"department_id": departmentId,
			"status":        OrganizationMemberStatusEnabled,
			"updated_at":    common.GetTimestamp(),
		}),
	}).Create(&member).Error
	if err != nil {
		return nil, err
	}
	err = tx.Where("organization_id = ? AND user_id = ?", orgId, userId).First(&member).Error
	return &member, err
}

func GetOrganizationRoles(orgId int) ([]*OrganizationRole, error) {
	var roles []*OrganizationRole
	err := DB.Where("organization_id = ?", orgId).
		Order("sort asc, id asc").
		Find(&roles).Error
	return roles, err
}

func GetOrganizationRoleById(orgId int, id int) (*OrganizationRole, error) {
	if orgId == 0 || id == 0 {
		return nil, errors.New("organization id and role id are required")
	}
	var role OrganizationRole
	err := DB.Where("organization_id = ? AND id = ?", orgId, id).First(&role).Error
	return &role, err
}

func GetOrganizationRoleByKey(orgId int, key string) (*OrganizationRole, error) {
	if orgId == 0 || key == "" {
		return nil, errors.New("organization id and role key are required")
	}
	var role OrganizationRole
	err := DB.Where("organization_id = ? AND key = ?", orgId, key).First(&role).Error
	return &role, err
}

func IsOrganizationRoleKeyDuplicated(orgId int, id int, key string) (bool, error) {
	if orgId == 0 || key == "" {
		return false, nil
	}
	var count int64
	err := DB.Model(&OrganizationRole{}).
		Where("organization_id = ? AND key = ? AND id <> ?", orgId, key, id).
		Count(&count).Error
	return count > 0, err
}

func CreateOrganizationRole(role *OrganizationRole, permissions orgauth.PermissionMatrix) error {
	if role == nil {
		return errors.New("role is required")
	}
	permissionsJson, err := marshalOrganizationPermissions(permissions)
	if err != nil {
		return err
	}
	role.Permissions = permissionsJson
	role.BuiltIn = false
	if role.Sort == 0 {
		role.Sort = 1000
	}
	return DB.Create(role).Error
}

func UpdateOrganizationRole(role *OrganizationRole, permissions orgauth.PermissionMatrix) error {
	if role == nil || role.Id == 0 {
		return errors.New("role id is required")
	}
	permissionsJson, err := marshalOrganizationPermissions(permissions)
	if err != nil {
		return err
	}
	return DB.Model(&OrganizationRole{}).
		Where("id = ? AND organization_id = ?", role.Id, role.OrganizationId).
		Updates(map[string]interface{}{
			"key":         role.Key,
			"name":        role.Name,
			"description": role.Description,
			"permissions": permissionsJson,
			"enabled":     role.Enabled,
			"sort":        role.Sort,
		}).Error
}

func DeleteOrganizationRole(orgId int, id int) error {
	role, err := GetOrganizationRoleById(orgId, id)
	if err != nil {
		return err
	}
	if role.BuiltIn {
		return errors.New("built-in roles cannot be deleted")
	}
	return DB.Delete(&OrganizationRole{}, "id = ? AND organization_id = ?", id, orgId).Error
}

func CreateOrganizationInvitation(invitation *OrganizationInvitation, rawToken string) error {
	if invitation == nil {
		return errors.New("invitation is required")
	}
	if invitation.OrganizationId == 0 || invitation.RoleKey == "" || rawToken == "" {
		return errors.New("organization id, role key, and token are required")
	}
	invitation.Email = NormalizeEmail(invitation.Email)
	invitation.TokenHash = common.GenerateHMAC(rawToken)
	invitation.Status = OrganizationInvitationStatusPending
	if invitation.ExpiresAt == 0 {
		invitation.ExpiresAt = common.GetTimestamp() + 7*24*60*60
	}
	return DB.Create(invitation).Error
}

func GetOrganizationInvitations(orgId int) ([]*OrganizationInvitation, error) {
	var invitations []*OrganizationInvitation
	err := DB.Where("organization_id = ?", orgId).
		Order("id desc").
		Find(&invitations).Error
	return invitations, err
}

func RevokeOrganizationInvitation(orgId int, id int) error {
	return DB.Model(&OrganizationInvitation{}).
		Where("organization_id = ? AND id = ? AND status = ?", orgId, id, OrganizationInvitationStatusPending).
		Update("status", OrganizationInvitationStatusRevoked).Error
}

func AcceptOrganizationInvitation(rawToken string, userId int) (*OrganizationMember, error) {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" || userId == 0 {
		return nil, errors.New("invitation token and user id are required")
	}
	var member *OrganizationMember
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := tx.Where("id = ?", userId).First(&user).Error; err != nil {
			return err
		}
		acceptedMember, acceptErr := AcceptOrganizationInvitationWithTx(tx, rawToken, userId, user.Email)
		member = acceptedMember
		return acceptErr
	})
	return member, err
}

func AcceptOrganizationInvitationWithTx(tx *gorm.DB, rawToken string, userId int, userEmail string) (*OrganizationMember, error) {
	if tx == nil {
		tx = DB
	}
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" || userId == 0 {
		return nil, errors.New("invitation token and user id are required")
	}
	var invitation OrganizationInvitation
	err := tx.Where("token_hash = ? AND status = ?", common.GenerateHMAC(rawToken), OrganizationInvitationStatusPending).
		First(&invitation).Error
	if err != nil {
		return nil, err
	}
	now := common.GetTimestamp()
	if invitation.ExpiresAt > 0 && invitation.ExpiresAt < now {
		if err := tx.Model(&invitation).Update("status", OrganizationInvitationStatusExpired).Error; err != nil {
			return nil, err
		}
		return nil, errors.New("invitation expired")
	}
	if invitation.Email != "" && NormalizeEmail(userEmail) != invitation.Email {
		return nil, errors.New("invitation email does not match current user")
	}
	var existingMember OrganizationMember
	err = tx.Where("user_id = ? AND status = ?", userId, OrganizationMemberStatusEnabled).
		Order("id asc").
		First(&existingMember).Error
	if err == nil && existingMember.OrganizationId != invitation.OrganizationId {
		return nil, errors.New("user already belongs to another organization")
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	member, err := AddOrganizationMember(tx, invitation.OrganizationId, userId, invitation.RoleKey, invitation.DepartmentId)
	if err != nil {
		return nil, err
	}
	return member, tx.Model(&invitation).Updates(map[string]interface{}{
		"status":              OrganizationInvitationStatusAccepted,
		"accepted_by_user_id": userId,
		"accepted_at":         now,
	}).Error
}

func GetOrganizationDepartments(orgId int) ([]*OrganizationDepartment, error) {
	if orgId == 0 {
		return nil, errors.New("organization id is required")
	}
	var departments []*OrganizationDepartment
	err := DB.Where("organization_id = ?", orgId).
		Order("sort asc, id asc").
		Find(&departments).Error
	return departments, err
}

func GetOrganizationDepartmentById(orgId int, id int) (*OrganizationDepartment, error) {
	if orgId == 0 || id == 0 {
		return nil, errors.New("organization id and department id are required")
	}
	var department OrganizationDepartment
	err := DB.Where("organization_id = ? AND id = ?", orgId, id).First(&department).Error
	return &department, err
}

func CreateOrganizationDepartment(department *OrganizationDepartment) error {
	if department == nil || department.OrganizationId == 0 {
		return errors.New("organization id is required")
	}
	department.Name = strings.TrimSpace(department.Name)
	if department.Name == "" {
		return errors.New("department name is required")
	}
	department.Status = OrganizationDepartmentStatusEnabled
	return DB.Transaction(func(tx *gorm.DB) error {
		if department.ParentId != 0 {
			var count int64
			if err := tx.Model(&OrganizationDepartment{}).
				Where("organization_id = ? AND id = ?", department.OrganizationId, department.ParentId).
				Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return errors.New("parent department not found")
			}
		}
		return tx.Create(department).Error
	})
}

// wouldCreateDepartmentCycle reports whether re-parenting department `id`
// under `parentId` would create a cycle, by walking the ancestor chain of the
// new parent. `parents` maps department id -> parent id for one organization.
func wouldCreateDepartmentCycle(parents map[int]int, id int, parentId int) bool {
	// Bounded walk guards against pre-existing broken chains.
	for step := 0; step <= len(parents); step++ {
		if parentId == 0 {
			return false
		}
		if parentId == id {
			return true
		}
		parentId = parents[parentId]
	}
	return true
}

func UpdateOrganizationDepartment(orgId int, id int, name string, parentId int, sort int) error {
	if orgId == 0 || id == 0 {
		return errors.New("organization id and department id are required")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("department name is required")
	}
	if parentId == id {
		return errors.New("department cannot be its own parent")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var departments []*OrganizationDepartment
		if err := tx.Where("organization_id = ?", orgId).Find(&departments).Error; err != nil {
			return err
		}
		parents := make(map[int]int, len(departments))
		exists := false
		parentExists := parentId == 0
		for _, dept := range departments {
			parents[dept.Id] = dept.ParentId
			if dept.Id == id {
				exists = true
			}
			if dept.Id == parentId {
				parentExists = true
			}
		}
		if !exists {
			return errors.New("department not found")
		}
		if !parentExists {
			return errors.New("parent department not found")
		}
		if wouldCreateDepartmentCycle(parents, id, parentId) {
			return errors.New("department cannot be moved under its own descendant")
		}
		return tx.Model(&OrganizationDepartment{}).
			Where("organization_id = ? AND id = ?", orgId, id).
			Updates(map[string]interface{}{
				"name":      name,
				"parent_id": parentId,
				"sort":      sort,
			}).Error
	})
}

func DeleteOrganizationDepartment(orgId int, id int) error {
	if orgId == 0 || id == 0 {
		return errors.New("organization id and department id are required")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var childCount int64
		if err := tx.Model(&OrganizationDepartment{}).
			Where("organization_id = ? AND parent_id = ?", orgId, id).
			Count(&childCount).Error; err != nil {
			return err
		}
		if childCount > 0 {
			return errors.New("department has sub-departments, move or delete them first")
		}
		var memberCount int64
		if err := tx.Model(&OrganizationMember{}).
			Where("organization_id = ? AND department_id = ?", orgId, id).
			Count(&memberCount).Error; err != nil {
			return err
		}
		if memberCount > 0 {
			return errors.New("department has members, move them out first")
		}
		return tx.Delete(&OrganizationDepartment{}, "organization_id = ? AND id = ?", orgId, id).Error
	})
}

func CountOrganizationDepartmentMembers(orgId int) (map[int]int64, error) {
	if orgId == 0 {
		return nil, errors.New("organization id is required")
	}
	type departmentMemberCount struct {
		DepartmentId int   `gorm:"column:department_id"`
		Total        int64 `gorm:"column:total"`
	}
	var rows []departmentMemberCount
	err := DB.Model(&OrganizationMember{}).
		Select("department_id, count(*) as total").
		Where("organization_id = ? AND status = ?", orgId, OrganizationMemberStatusEnabled).
		Group("department_id").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	counts := make(map[int]int64, len(rows))
	for _, row := range rows {
		counts[row.DepartmentId] = row.Total
	}
	return counts, nil
}

func GetOrganizationMemberById(orgId int, id int) (*OrganizationMember, error) {
	if orgId == 0 || id == 0 {
		return nil, errors.New("organization id and member id are required")
	}
	var member OrganizationMember
	err := DB.Where("organization_id = ? AND id = ?", orgId, id).First(&member).Error
	return &member, err
}

// GetOrganizationOwnedByUser returns the organization the user owns, or
// gorm.ErrRecordNotFound when the user owns none.
func GetOrganizationOwnedByUser(userId int) (*Organization, error) {
	if userId == 0 {
		return nil, errors.New("user id is required")
	}
	var org Organization
	err := DB.Where("owner_user_id = ? AND status = ?", userId, OrganizationStatusEnabled).
		Order("id asc").
		First(&org).Error
	return &org, err
}

// GetOrganizationMembershipOfUser returns the user's own membership record
// (first enabled one), or gorm.ErrRecordNotFound.
func GetOrganizationMembershipOfUser(userId int) (*OrganizationMember, error) {
	if userId == 0 {
		return nil, errors.New("user id is required")
	}
	var member OrganizationMember
	err := DB.Where("user_id = ? AND status = ?", userId, OrganizationMemberStatusEnabled).
		Order("id asc").
		First(&member).Error
	return &member, err
}

// UpdateOrganizationMember changes a member's role, department, and status.
// The organization owner is protected: their role must remain `owner` and
// their membership cannot be disabled.
func UpdateOrganizationMember(orgId int, memberId int, roleKey string, departmentId int, status int) (*OrganizationMember, error) {
	if orgId == 0 || memberId == 0 {
		return nil, errors.New("organization id and member id are required")
	}
	if roleKey == "" {
		return nil, errors.New("role key is required")
	}
	if status != OrganizationMemberStatusEnabled && status != OrganizationMemberStatusDisabled {
		return nil, errors.New("invalid member status")
	}
	var member OrganizationMember
	err := DB.Transaction(func(tx *gorm.DB) error {
		var org Organization
		if err := tx.First(&org, "id = ?", orgId).Error; err != nil {
			return err
		}
		if err := tx.Where("organization_id = ? AND id = ?", orgId, memberId).First(&member).Error; err != nil {
			return err
		}
		if member.UserId == org.OwnerUserId {
			if roleKey != OrganizationRoleOwner {
				return errors.New("the organization owner's role cannot be changed")
			}
			if status != OrganizationMemberStatusEnabled {
				return errors.New("the organization owner cannot be disabled")
			}
		}
		if departmentId != 0 {
			var count int64
			if err := tx.Model(&OrganizationDepartment{}).
				Where("organization_id = ? AND id = ?", orgId, departmentId).
				Count(&count).Error; err != nil {
				return err
			}
			if count == 0 {
				return errors.New("department not found")
			}
		}
		if err := tx.Model(&OrganizationMember{}).
			Where("organization_id = ? AND id = ?", orgId, memberId).
			Updates(map[string]interface{}{
				"role_key":      roleKey,
				"department_id": departmentId,
				"status":        status,
			}).Error; err != nil {
			return err
		}
		return tx.Where("organization_id = ? AND id = ?", orgId, memberId).First(&member).Error
	})
	if err != nil {
		return nil, err
	}
	return &member, nil
}

func marshalOrganizationPermissions(permissions orgauth.PermissionMatrix) (string, error) {
	normalized := orgauth.NormalizePermissions(permissions)
	data, err := common.Marshal(normalized)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func ParseOrganizationPermissions(data string) orgauth.PermissionMatrix {
	if data == "" {
		return orgauth.EmptyPermissionMatrix()
	}
	var permissions orgauth.PermissionMatrix
	if err := common.UnmarshalJsonStr(data, &permissions); err != nil {
		common.SysLog("failed to unmarshal organization permissions: " + err.Error())
		return orgauth.EmptyPermissionMatrix()
	}
	return orgauth.NormalizePermissions(permissions)
}

// CollectDepartmentSubtreeIds returns rootId plus all of its descendant
// department ids within one organization. The walk is bounded by the total
// department count so a corrupted parent chain can never loop forever.
func CollectDepartmentSubtreeIds(orgId int, rootId int) ([]int, error) {
	departments, err := GetOrganizationDepartments(orgId)
	if err != nil {
		return nil, err
	}
	childrenByParent := make(map[int][]int, len(departments))
	for _, dept := range departments {
		childrenByParent[dept.ParentId] = append(childrenByParent[dept.ParentId], dept.Id)
	}
	result := make([]int, 0, len(departments))
	visited := make(map[int]bool, len(departments))
	queue := []int{rootId}
	for len(queue) > 0 && len(result) <= len(departments) {
		current := queue[0]
		queue = queue[1:]
		if visited[current] {
			continue
		}
		visited[current] = true
		result = append(result, current)
		queue = append(queue, childrenByParent[current]...)
	}
	return result, nil
}

// GetOrganizationMemberUserIds returns the enabled member user ids for the
// organization, optionally restricted to a set of department ids. An empty
// departmentIds slice means "all members of the organization".
func GetOrganizationMemberUserIds(orgId int, departmentIds []int) ([]int, error) {
	if orgId == 0 {
		return nil, errors.New("organization id is required")
	}
	query := DB.Model(&OrganizationMember{}).
		Where("organization_id = ? AND status = ?", orgId, OrganizationMemberStatusEnabled)
	if len(departmentIds) > 0 {
		query = query.Where("department_id IN ?", departmentIds)
	}
	var userIds []int
	err := query.Pluck("user_id", &userIds).Error
	return userIds, err
}
