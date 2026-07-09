package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/stretchr/testify/assert"
)

func TestCanViewUserData(t *testing.T) {
	const (
		adminId  = 1
		leadId   = 2
		peerId   = 3
		outsider = 99
	)
	// The lead can see themselves plus two department members (ids 3 and 4).
	deptScope := []int{leadId, peerId, 4}

	testCases := []struct {
		name         string
		callerRole   int
		callerId     int
		targetUserId int
		scope        []int
		want         bool
	}{
		{
			name:         "admin sees anyone",
			callerRole:   common.RoleAdminUser,
			callerId:     adminId,
			targetUserId: outsider,
			scope:        nil,
			want:         true,
		},
		{
			name:         "root sees anyone",
			callerRole:   common.RoleRootUser,
			callerId:     adminId,
			targetUserId: outsider,
			scope:        nil,
			want:         true,
		},
		{
			name:         "common user sees self",
			callerRole:   common.RoleCommonUser,
			callerId:     peerId,
			targetUserId: peerId,
			scope:        nil,
			want:         true,
		},
		{
			name:         "lead sees department member",
			callerRole:   common.RoleCommonUser,
			callerId:     leadId,
			targetUserId: peerId,
			scope:        deptScope,
			want:         true,
		},
		{
			name:         "lead cannot see user outside department",
			callerRole:   common.RoleCommonUser,
			callerId:     leadId,
			targetUserId: outsider,
			scope:        deptScope,
			want:         false,
		},
		{
			name:         "common user with empty scope cannot see others",
			callerRole:   common.RoleCommonUser,
			callerId:     peerId,
			targetUserId: leadId,
			scope:        []int{},
			want:         false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			got := canViewUserData(tc.callerRole, tc.callerId, tc.targetUserId, tc.scope)
			assert.Equal(t, tc.want, got)
		})
	}
}
