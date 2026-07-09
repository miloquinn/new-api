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
