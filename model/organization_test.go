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
	require.NoError(t, DB.Exec("DELETE FROM organization_departments").Error)
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

func TestOrganizationDepartmentTreeGuards(t *testing.T) {
	setupOrganizationTestState(t)

	owner := User{Username: "owner", Password: "password", Status: common.UserStatusEnabled, AffCode: "owner3"}
	require.NoError(t, DB.Create(&owner).Error)
	org := Organization{Name: "Tree Org", OwnerUserId: owner.Id, Status: OrganizationStatusEnabled}
	require.NoError(t, DB.Create(&org).Error)

	deptA := OrganizationDepartment{OrganizationId: org.Id, Name: "Tech"}
	require.NoError(t, CreateOrganizationDepartment(&deptA))
	deptB := OrganizationDepartment{OrganizationId: org.Id, ParentId: deptA.Id, Name: "Frontend"}
	require.NoError(t, CreateOrganizationDepartment(&deptB))
	deptC := OrganizationDepartment{OrganizationId: org.Id, ParentId: deptB.Id, Name: "Web"}
	require.NoError(t, CreateOrganizationDepartment(&deptC))

	// Creating under a parent from another organization must fail.
	orphan := OrganizationDepartment{OrganizationId: org.Id + 1000, ParentId: deptA.Id, Name: "Ghost"}
	require.Error(t, CreateOrganizationDepartment(&orphan))

	// Self-parenting and descendant cycles must be rejected.
	require.ErrorContains(t, UpdateOrganizationDepartment(org.Id, deptA.Id, "Tech", deptA.Id, 0), "own parent")
	require.ErrorContains(t, UpdateOrganizationDepartment(org.Id, deptA.Id, "Tech", deptC.Id, 0), "descendant")
	require.ErrorContains(t, UpdateOrganizationDepartment(org.Id, deptB.Id, "Frontend", 99999, 0), "parent department not found")

	// A legal move keeps the tree intact: C moves from B to A.
	require.NoError(t, UpdateOrganizationDepartment(org.Id, deptC.Id, "Web Platform", deptA.Id, 5))
	moved, err := GetOrganizationDepartmentById(org.Id, deptC.Id)
	require.NoError(t, err)
	assert.Equal(t, deptA.Id, moved.ParentId)
	assert.Equal(t, "Web Platform", moved.Name)
	assert.Equal(t, 5, moved.Sort)
}

func TestDeleteOrganizationDepartmentProtections(t *testing.T) {
	setupOrganizationTestState(t)

	owner := User{Username: "owner", Password: "password", Status: common.UserStatusEnabled, AffCode: "owner4"}
	staff := User{Username: "staff", Password: "password", Status: common.UserStatusEnabled, AffCode: "staff4"}
	require.NoError(t, DB.Create(&owner).Error)
	require.NoError(t, DB.Create(&staff).Error)
	org := Organization{Name: "Delete Org", OwnerUserId: owner.Id, Status: OrganizationStatusEnabled}
	require.NoError(t, DB.Create(&org).Error)

	parent := OrganizationDepartment{OrganizationId: org.Id, Name: "Parent"}
	require.NoError(t, CreateOrganizationDepartment(&parent))
	child := OrganizationDepartment{OrganizationId: org.Id, ParentId: parent.Id, Name: "Child"}
	require.NoError(t, CreateOrganizationDepartment(&child))
	_, err := AddOrganizationMember(DB, org.Id, staff.Id, "developer", child.Id)
	require.NoError(t, err)

	require.ErrorContains(t, DeleteOrganizationDepartment(org.Id, parent.Id), "sub-departments")
	require.ErrorContains(t, DeleteOrganizationDepartment(org.Id, child.Id), "members")

	// Move the member out, then the leaf becomes deletable; parent follows.
	_, err = UpdateOrganizationMember(org.Id, mustMemberId(t, org.Id, staff.Id), "developer", 0, OrganizationMemberStatusEnabled)
	require.NoError(t, err)
	require.NoError(t, DeleteOrganizationDepartment(org.Id, child.Id))
	require.NoError(t, DeleteOrganizationDepartment(org.Id, parent.Id))
}

func TestUpdateOrganizationMemberOwnerProtection(t *testing.T) {
	setupOrganizationTestState(t)

	owner := User{Username: "owner", Password: "password", Status: common.UserStatusEnabled, AffCode: "owner5"}
	staff := User{Username: "staff", Password: "password", Status: common.UserStatusEnabled, AffCode: "staff5"}
	require.NoError(t, DB.Create(&owner).Error)
	require.NoError(t, DB.Create(&staff).Error)
	org := Organization{Name: "Protect Org", OwnerUserId: owner.Id, Status: OrganizationStatusEnabled}
	require.NoError(t, DB.Create(&org).Error)
	_, err := AddOrganizationMember(DB, org.Id, owner.Id, OrganizationRoleOwner, 0)
	require.NoError(t, err)
	_, err = AddOrganizationMember(DB, org.Id, staff.Id, "developer", 0)
	require.NoError(t, err)

	ownerMemberId := mustMemberId(t, org.Id, owner.Id)
	staffMemberId := mustMemberId(t, org.Id, staff.Id)

	_, err = UpdateOrganizationMember(org.Id, ownerMemberId, "developer", 0, OrganizationMemberStatusEnabled)
	require.ErrorContains(t, err, "owner's role cannot be changed")
	_, err = UpdateOrganizationMember(org.Id, ownerMemberId, OrganizationRoleOwner, 0, OrganizationMemberStatusDisabled)
	require.ErrorContains(t, err, "cannot be disabled")

	dept := OrganizationDepartment{OrganizationId: org.Id, Name: "Finance"}
	require.NoError(t, CreateOrganizationDepartment(&dept))

	_, err = UpdateOrganizationMember(org.Id, staffMemberId, "finance", 99999, OrganizationMemberStatusEnabled)
	require.ErrorContains(t, err, "department not found")

	updated, err := UpdateOrganizationMember(org.Id, staffMemberId, "finance", dept.Id, OrganizationMemberStatusDisabled)
	require.NoError(t, err)
	assert.Equal(t, "finance", updated.RoleKey)
	assert.Equal(t, dept.Id, updated.DepartmentId)
	assert.Equal(t, OrganizationMemberStatusDisabled, updated.Status)

	counts, err := CountOrganizationDepartmentMembers(org.Id)
	require.NoError(t, err)
	assert.Zero(t, counts[dept.Id], "disabled members must not count toward department size")
}

func mustMemberId(t *testing.T, orgId int, userId int) int {
	t.Helper()
	member, err := GetOrganizationMember(orgId, userId)
	if err != nil {
		var anyStatus OrganizationMember
		require.NoError(t, DB.Where("organization_id = ? AND user_id = ?", orgId, userId).First(&anyStatus).Error)
		return anyStatus.Id
	}
	return member.Id
}

func TestCollectDepartmentSubtreeIds(t *testing.T) {
	setupOrganizationTestState(t)

	owner := User{Username: "owner", Password: "password", Status: common.UserStatusEnabled, AffCode: "subtree1"}
	require.NoError(t, DB.Create(&owner).Error)
	org := Organization{Name: "Subtree Org", OwnerUserId: owner.Id, Status: OrganizationStatusEnabled}
	require.NoError(t, DB.Create(&org).Error)

	tech := OrganizationDepartment{OrganizationId: org.Id, Name: "Tech"}
	require.NoError(t, CreateOrganizationDepartment(&tech))
	frontend := OrganizationDepartment{OrganizationId: org.Id, ParentId: tech.Id, Name: "Frontend"}
	require.NoError(t, CreateOrganizationDepartment(&frontend))
	web := OrganizationDepartment{OrganizationId: org.Id, ParentId: frontend.Id, Name: "Web"}
	require.NoError(t, CreateOrganizationDepartment(&web))
	finance := OrganizationDepartment{OrganizationId: org.Id, Name: "Finance"}
	require.NoError(t, CreateOrganizationDepartment(&finance))

	ids, err := CollectDepartmentSubtreeIds(org.Id, tech.Id)
	require.NoError(t, err)
	assert.ElementsMatch(t, []int{tech.Id, frontend.Id, web.Id}, ids)

	// Finance is a sibling branch and must not leak into Tech's subtree.
	assert.NotContains(t, ids, finance.Id)

	leaf, err := CollectDepartmentSubtreeIds(org.Id, web.Id)
	require.NoError(t, err)
	assert.Equal(t, []int{web.Id}, leaf)
}

func TestGetOrganizationMemberUserIdsScopes(t *testing.T) {
	setupOrganizationTestState(t)

	owner := User{Username: "owner", Password: "password", Status: common.UserStatusEnabled, AffCode: "scope-o"}
	alice := User{Username: "alice", Password: "password", Status: common.UserStatusEnabled, AffCode: "scope-a"}
	bob := User{Username: "bob", Password: "password", Status: common.UserStatusEnabled, AffCode: "scope-b"}
	carol := User{Username: "carol", Password: "password", Status: common.UserStatusEnabled, AffCode: "scope-c"}
	for _, u := range []*User{&owner, &alice, &bob, &carol} {
		require.NoError(t, DB.Create(u).Error)
	}
	org := Organization{Name: "Scope Org", OwnerUserId: owner.Id, Status: OrganizationStatusEnabled}
	require.NoError(t, DB.Create(&org).Error)

	tech := OrganizationDepartment{OrganizationId: org.Id, Name: "Tech"}
	require.NoError(t, CreateOrganizationDepartment(&tech))
	frontend := OrganizationDepartment{OrganizationId: org.Id, ParentId: tech.Id, Name: "Frontend"}
	require.NoError(t, CreateOrganizationDepartment(&frontend))
	finance := OrganizationDepartment{OrganizationId: org.Id, Name: "Finance"}
	require.NoError(t, CreateOrganizationDepartment(&finance))

	_, err := AddOrganizationMember(DB, org.Id, alice.Id, "developer", tech.Id)
	require.NoError(t, err)
	_, err = AddOrganizationMember(DB, org.Id, bob.Id, "developer", frontend.Id)
	require.NoError(t, err)
	_, err = AddOrganizationMember(DB, org.Id, carol.Id, "finance", finance.Id)
	require.NoError(t, err)

	// Whole-organization scope: nil department filter returns every member.
	all, err := GetOrganizationMemberUserIds(org.Id, nil)
	require.NoError(t, err)
	assert.ElementsMatch(t, []int{alice.Id, bob.Id, carol.Id}, all)

	// Department subtree scope: Tech + Frontend, but never Finance.
	techIds, err := CollectDepartmentSubtreeIds(org.Id, tech.Id)
	require.NoError(t, err)
	techUsers, err := GetOrganizationMemberUserIds(org.Id, techIds)
	require.NoError(t, err)
	assert.ElementsMatch(t, []int{alice.Id, bob.Id}, techUsers)
	assert.NotContains(t, techUsers, carol.Id)

	// Disabled members drop out of the visible scope entirely.
	_, err = UpdateOrganizationMember(org.Id, mustMemberId(t, org.Id, bob.Id), "developer", frontend.Id, OrganizationMemberStatusDisabled)
	require.NoError(t, err)
	techUsersAfter, err := GetOrganizationMemberUserIds(org.Id, techIds)
	require.NoError(t, err)
	assert.ElementsMatch(t, []int{alice.Id}, techUsersAfter)
}

func TestGetQuotaDataByUserIdsEmptyScope(t *testing.T) {
	// The empty-scope contract is a safety invariant: no user ids must never
	// widen into "all usage".
	data, err := GetQuotaDataByUserIds(nil, 0, common.GetTimestamp()+1, false)
	require.NoError(t, err)
	assert.Empty(t, data)
}

func TestGetLogsByUserIdsEmptyScope(t *testing.T) {
	logs, total, err := GetLogsByUserIds(nil, 0, 0, 0, "", "", 0, 20, "")
	require.NoError(t, err)
	assert.Zero(t, total)
	assert.Empty(t, logs)
}
