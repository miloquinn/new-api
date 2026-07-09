package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupOrganizationTestState(t *testing.T) {
	t.Helper()
	truncateTables(t)
	require.NoError(t, DB.Exec("DELETE FROM organization_invitations").Error)
	require.NoError(t, DB.Exec("DELETE FROM organization_members").Error)
	require.NoError(t, DB.Exec("DELETE FROM organization_roles").Error)
	require.NoError(t, DB.Exec("DELETE FROM organizations").Error)
	require.NoError(t, DB.Exec("DELETE FROM users").Error)
}

func TestAcceptOrganizationInvitationCreatesMember(t *testing.T) {
	setupOrganizationTestState(t)

	owner := User{Username: "owner", Password: "password", Status: common.UserStatusEnabled, AffCode: "owner1"}
	employee := User{Username: "employee", Email: "employee@example.com", Password: "password", Status: common.UserStatusEnabled, AffCode: "employee1"}
	require.NoError(t, DB.Create(&owner).Error)
	require.NoError(t, DB.Create(&employee).Error)

	org := Organization{Name: "Owner Org", OwnerUserId: owner.Id, Status: OrganizationStatusEnabled}
	require.NoError(t, DB.Create(&org).Error)

	rawToken := "invite-token"
	invitation := OrganizationInvitation{
		OrganizationId:  org.Id,
		Email:           "Employee@Example.com",
		RoleKey:         "developer",
		InvitedByUserId: owner.Id,
		ExpiresAt:       common.GetTimestamp() + 3600,
	}
	require.NoError(t, CreateOrganizationInvitation(&invitation, rawToken))

	member, err := AcceptOrganizationInvitation(rawToken, employee.Id)
	require.NoError(t, err)
	require.Equal(t, org.Id, member.OrganizationId)
	require.Equal(t, employee.Id, member.UserId)
	require.Equal(t, "developer", member.RoleKey)

	var stored OrganizationInvitation
	require.NoError(t, DB.First(&stored, invitation.Id).Error)
	assert.Equal(t, OrganizationInvitationStatusAccepted, stored.Status)
	assert.Equal(t, employee.Id, stored.AcceptedByUserId)
	assert.NotZero(t, stored.AcceptedAt)
}

func TestAcceptOrganizationInvitationRejectsDifferentExistingOrganization(t *testing.T) {
	setupOrganizationTestState(t)

	owner := User{Username: "owner", Password: "password", Status: common.UserStatusEnabled, AffCode: "owner2"}
	employee := User{Username: "employee", Email: "employee@example.com", Password: "password", Status: common.UserStatusEnabled, AffCode: "employee2"}
	require.NoError(t, DB.Create(&owner).Error)
	require.NoError(t, DB.Create(&employee).Error)

	firstOrg := Organization{Name: "First Org", OwnerUserId: employee.Id, Status: OrganizationStatusEnabled}
	secondOrg := Organization{Name: "Second Org", OwnerUserId: owner.Id, Status: OrganizationStatusEnabled}
	require.NoError(t, DB.Create(&firstOrg).Error)
	require.NoError(t, DB.Create(&secondOrg).Error)
	_, err := AddOrganizationMember(DB, firstOrg.Id, employee.Id, OrganizationRoleOwner, 0)
	require.NoError(t, err)

	rawToken := "second-invite-token"
	invitation := OrganizationInvitation{
		OrganizationId:  secondOrg.Id,
		RoleKey:         "developer",
		InvitedByUserId: owner.Id,
		ExpiresAt:       common.GetTimestamp() + 3600,
	}
	require.NoError(t, CreateOrganizationInvitation(&invitation, rawToken))

	_, err = AcceptOrganizationInvitation(rawToken, employee.Id)
	require.ErrorContains(t, err, "another organization")

	var stored OrganizationInvitation
	require.NoError(t, DB.First(&stored, invitation.Id).Error)
	assert.Equal(t, OrganizationInvitationStatusPending, stored.Status)
}
