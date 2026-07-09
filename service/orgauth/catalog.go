package orgauth

type PermissionMatrix map[string]map[string]bool

type ActionDefinition struct {
	Action         string `json:"action"`
	LabelKey       string `json:"label_key"`
	DescriptionKey string `json:"description_key"`
	Sensitive      bool   `json:"sensitive"`
}

type ResourceDefinition struct {
	Resource string             `json:"resource"`
	LabelKey string             `json:"label_key"`
	Actions  []ActionDefinition `json:"actions"`
}

type RoleTemplate struct {
	Key         string           `json:"key"`
	Name        string           `json:"name"`
	Description string           `json:"description"`
	Permissions PermissionMatrix `json:"permissions"`
}

const (
	ResourceWorkspace   = "workspace"
	ResourceMembers     = "members"
	ResourceRoles       = "roles"
	ResourceDepartments = "departments"
	ResourceTokens      = "tokens"
	ResourceModels      = "models"
	ResourceUsage       = "usage"
	ResourceLogs        = "logs"
	ResourceQuota       = "quota"
	ResourceBilling     = "billing"
	ResourceSupport     = "support"
	ResourceAudit       = "audit"
	ResourceExport      = "export"
	ResourceSettings    = "settings"
)

var catalog = []ResourceDefinition{
	{
		Resource: ResourceWorkspace,
		LabelKey: "Workspace",
		Actions: []ActionDefinition{
			action("overview.read", "View overview", "View organization dashboards and notices.", false),
			action("announcements.read", "View announcements", "View organization and platform announcements.", false),
		},
	},
	{
		Resource: ResourceMembers,
		LabelKey: "Member Management",
		Actions: []ActionDefinition{
			action("read", "View members", "View organization members.", false),
			action("create", "Create members", "Create or invite organization members.", true),
			action("update", "Edit members", "Edit member profile, department, and status.", true),
			action("disable", "Disable members", "Disable organization members.", true),
			action("reset_password", "Reset member passwords", "Reset member passwords or authentication factors.", true),
		},
	},
	{
		Resource: ResourceRoles,
		LabelKey: "Role Permissions",
		Actions: []ActionDefinition{
			action("read", "View roles", "View role templates and grants.", false),
			action("create", "Create roles", "Create organization role templates.", true),
			action("update", "Edit roles", "Edit organization role templates.", true),
			action("delete", "Delete roles", "Delete custom role templates.", true),
			action("assign", "Assign roles", "Assign roles to organization members.", true),
		},
	},
	{
		Resource: ResourceDepartments,
		LabelKey: "Department Management",
		Actions: []ActionDefinition{
			action("read", "View departments", "View departments and department members.", false),
			action("create", "Create departments", "Create departments.", true),
			action("update", "Edit departments", "Edit departments.", true),
			action("delete", "Delete departments", "Delete departments.", true),
		},
	},
	{
		Resource: ResourceTokens,
		LabelKey: "API Key Management",
		Actions: []ActionDefinition{
			action("read_own", "View own keys", "View API keys owned by the member.", false),
			action("read_department", "View department keys", "View API keys in the member's department.", false),
			action("read_organization", "View organization keys", "View API keys across the organization.", true),
			action("create", "Create API keys", "Create API keys.", true),
			action("update", "Edit API keys", "Edit API key limits, models, and status.", true),
			action("delete", "Delete API keys", "Delete API keys.", true),
			action("secret_view", "View full API keys", "Reveal complete API key secrets.", true),
		},
	},
	{
		Resource: ResourceModels,
		LabelKey: "Model Access",
		Actions: []ActionDefinition{
			action("read", "View models", "View available models and prices.", false),
			action("use", "Use models", "Call enabled models through organization API keys.", false),
			action("assign", "Assign model access", "Adjust member or role model access.", true),
		},
	},
	{
		Resource: ResourceUsage,
		LabelKey: "Usage Analytics",
		Actions: []ActionDefinition{
			action("read_own", "View own usage", "View the member's own usage.", false),
			action("read_department", "View department usage", "View department usage summaries.", false),
			action("read_organization", "View organization usage", "View full organization usage summaries.", true),
			action("by_member", "Analyze by member", "Break usage down by member.", true),
			action("by_department", "Analyze by department", "Break usage down by department.", false),
			action("by_model", "Analyze by model", "Break usage down by model.", false),
			action("export", "Export usage reports", "Export usage reports.", true),
		},
	},
	{
		Resource: ResourceLogs,
		LabelKey: "Request Logs",
		Actions: []ActionDefinition{
			action("read_own", "View own logs", "View the member's own request logs.", false),
			action("read_department", "View department logs", "View department request logs.", true),
			action("read_organization", "View organization logs", "View all organization request logs.", true),
			action("error_reason", "View error reasons", "View upstream error and failure details.", false),
			action("request_id", "View request IDs", "View request and upstream request IDs.", false),
			action("prompt_view", "View prompts", "View prompt content from request logs.", true),
			action("response_view", "View responses", "View response content from request logs.", true),
			action("export", "Export logs", "Export request logs.", true),
		},
	},
	{
		Resource: ResourceQuota,
		LabelKey: "Quota Management",
		Actions: []ActionDefinition{
			action("balance.read", "View balance", "View organization balance and quota.", false),
			action("member.allocate", "Allocate member quota", "Allocate or adjust member quota.", true),
			action("department_budget.update", "Edit department budgets", "Adjust department budgets.", true),
			action("transactions.read", "View quota transactions", "View quota changes and usage records.", false),
			action("alerts.update", "Edit quota alerts", "Configure quota warning thresholds.", true),
		},
	},
	{
		Resource: ResourceBilling,
		LabelKey: "Billing",
		Actions: []ActionDefinition{
			action("balance.read", "View billing balance", "View balances and recharge records.", false),
			action("orders.read", "View orders", "View orders, invoices, and payment records.", false),
			action("spend.read", "View spend details", "View organization spend details.", false),
			action("export", "Export billing data", "Export billing and invoice data.", true),
			action("payment_method.manage", "Manage payment methods", "Manage payment methods.", true),
		},
	},
	{
		Resource: ResourceSupport,
		LabelKey: "Support Diagnostics",
		Actions: []ActionDefinition{
			action("member_lookup", "Lookup members", "Search members for support.", false),
			action("sanitized_logs.read", "View sanitized logs", "View sanitized request details.", false),
			action("error.read", "View support errors", "View error details needed for support.", false),
			action("task.retry", "Retry tasks", "Retry failed supported tasks.", true),
		},
	},
	{
		Resource: ResourceAudit,
		LabelKey: "Security Audit",
		Actions: []ActionDefinition{
			action("login.read", "View login logs", "View member login logs.", false),
			action("operations.read", "View operation audits", "View operation audit records.", true),
			action("permission_changes.read", "View permission changes", "View role and permission changes.", true),
			action("export", "Export audit logs", "Export audit records.", true),
		},
	},
	{
		Resource: ResourceExport,
		LabelKey: "Data Export",
		Actions: []ActionDefinition{
			action("usage", "Export usage", "Export usage analytics.", true),
			action("logs", "Export logs", "Export request logs.", true),
			action("billing", "Export billing", "Export billing records.", true),
			action("members", "Export members", "Export member lists.", true),
		},
	},
	{
		Resource: ResourceSettings,
		LabelKey: "Organization Settings",
		Actions: []ActionDefinition{
			action("read", "View settings", "View organization settings.", false),
			action("update_profile", "Edit organization profile", "Edit organization name and profile.", true),
			action("security.update", "Edit security settings", "Edit organization security settings.", true),
			action("defaults.update", "Edit default policies", "Edit default role and quota policies.", true),
		},
	},
}

func action(key string, label string, description string, sensitive bool) ActionDefinition {
	return ActionDefinition{
		Action:         key,
		LabelKey:       label,
		DescriptionKey: description,
		Sensitive:      sensitive,
	}
}

func Catalog() []ResourceDefinition {
	result := make([]ResourceDefinition, 0, len(catalog))
	for _, resource := range catalog {
		result = append(result, ResourceDefinition{
			Resource: resource.Resource,
			LabelKey: resource.LabelKey,
			Actions:  append([]ActionDefinition(nil), resource.Actions...),
		})
	}
	return result
}

func EmptyPermissionMatrix() PermissionMatrix {
	matrix := PermissionMatrix{}
	for _, resource := range catalog {
		matrix[resource.Resource] = map[string]bool{}
		for _, action := range resource.Actions {
			matrix[resource.Resource][action.Action] = false
		}
	}
	return matrix
}

func FullPermissionMatrix() PermissionMatrix {
	matrix := EmptyPermissionMatrix()
	for resource, actions := range matrix {
		for action := range actions {
			matrix[resource][action] = true
		}
	}
	return matrix
}

func NormalizePermissions(input PermissionMatrix) PermissionMatrix {
	matrix := EmptyPermissionMatrix()
	for _, resource := range catalog {
		for _, action := range resource.Actions {
			matrix[resource.Resource][action.Action] = input[resource.Resource][action.Action]
		}
	}
	return matrix
}

func DefaultRoleTemplates() []RoleTemplate {
	return []RoleTemplate{
		{
			Key:         "owner",
			Name:        "Organization Owner",
			Description: "Full organization access, including roles, billing, and sensitive data.",
			Permissions: FullPermissionMatrix(),
		},
		{
			Key:         "admin",
			Name:        "Organization Admin",
			Description: "Manage members, departments, API keys, and organization usage without platform-level settings.",
			Permissions: allow(
				grant(ResourceWorkspace, "overview.read", "announcements.read"),
				grant(ResourceMembers, "read", "create", "update", "disable", "reset_password"),
				grant(ResourceRoles, "read", "create", "update", "assign"),
				grant(ResourceDepartments, "read", "create", "update", "delete"),
				grant(ResourceTokens, "read_department", "read_organization", "create", "update", "delete"),
				grant(ResourceModels, "read", "use", "assign"),
				grant(ResourceUsage, "read_own", "read_department", "read_organization", "by_member", "by_department", "by_model", "export"),
				grant(ResourceLogs, "read_own", "read_department", "read_organization", "error_reason", "request_id"),
				grant(ResourceQuota, "balance.read", "member.allocate", "department_budget.update", "transactions.read", "alerts.update"),
				grant(ResourceSupport, "member_lookup", "sanitized_logs.read", "error.read", "task.retry"),
				grant(ResourceAudit, "login.read", "operations.read", "permission_changes.read"),
				grant(ResourceSettings, "read", "update_profile", "defaults.update"),
			),
		},
		{
			Key:         "department_lead",
			Name:        "Department Lead",
			Description: "Manage and inspect usage for one department.",
			Permissions: allow(
				grant(ResourceWorkspace, "overview.read", "announcements.read"),
				grant(ResourceMembers, "read"),
				grant(ResourceDepartments, "read"),
				grant(ResourceTokens, "read_own", "read_department", "create", "update"),
				grant(ResourceModels, "read", "use"),
				grant(ResourceUsage, "read_own", "read_department", "by_member", "by_model"),
				grant(ResourceLogs, "read_own", "read_department", "error_reason", "request_id"),
				grant(ResourceQuota, "balance.read", "transactions.read", "alerts.update"),
				grant(ResourceSupport, "member_lookup", "sanitized_logs.read", "error.read"),
			),
		},
		{
			Key:         "developer",
			Name:        "Developer",
			Description: "Use models, manage own API keys, and inspect own usage.",
			Permissions: allow(
				grant(ResourceWorkspace, "overview.read", "announcements.read"),
				grant(ResourceTokens, "read_own", "create", "update", "delete", "secret_view"),
				grant(ResourceModels, "read", "use"),
				grant(ResourceUsage, "read_own", "by_model"),
				grant(ResourceLogs, "read_own", "error_reason", "request_id"),
				grant(ResourceQuota, "balance.read"),
			),
		},
		{
			Key:         "operations",
			Name:        "Operations",
			Description: "Inspect usage trends, model consumption, and export operational reports.",
			Permissions: allow(
				grant(ResourceWorkspace, "overview.read", "announcements.read"),
				grant(ResourceModels, "read"),
				grant(ResourceUsage, "read_own", "read_department", "read_organization", "by_member", "by_department", "by_model", "export"),
				grant(ResourceLogs, "read_own", "read_department", "error_reason", "request_id"),
				grant(ResourceExport, "usage"),
			),
		},
		{
			Key:         "finance",
			Name:        "Finance",
			Description: "View balances, orders, billing exports, and spend reports without prompts or secrets.",
			Permissions: allow(
				grant(ResourceWorkspace, "overview.read", "announcements.read"),
				grant(ResourceUsage, "read_department", "read_organization", "by_department", "by_model", "export"),
				grant(ResourceQuota, "balance.read", "transactions.read", "alerts.update"),
				grant(ResourceBilling, "balance.read", "orders.read", "spend.read", "export"),
				grant(ResourceExport, "usage", "billing"),
			),
		},
		{
			Key:         "support",
			Name:        "Support",
			Description: "Troubleshoot member issues with sanitized logs and error details.",
			Permissions: allow(
				grant(ResourceWorkspace, "overview.read", "announcements.read"),
				grant(ResourceMembers, "read"),
				grant(ResourceUsage, "read_own", "read_department"),
				grant(ResourceLogs, "read_own", "read_department", "error_reason", "request_id"),
				grant(ResourceSupport, "member_lookup", "sanitized_logs.read", "error.read", "task.retry"),
				grant(ResourceAudit, "login.read"),
			),
		},
		{
			Key:         "business",
			Name:        "Business",
			Description: "View department or customer usage reports without managing keys or settings.",
			Permissions: allow(
				grant(ResourceWorkspace, "overview.read", "announcements.read"),
				grant(ResourceMembers, "read"),
				grant(ResourceModels, "read"),
				grant(ResourceUsage, "read_department", "read_organization", "by_member", "by_department", "by_model", "export"),
				grant(ResourceExport, "usage", "members"),
			),
		},
		{
			Key:         "auditor",
			Name:        "Auditor",
			Description: "Read security audit records and permission changes.",
			Permissions: allow(
				grant(ResourceWorkspace, "overview.read", "announcements.read"),
				grant(ResourceAudit, "login.read", "operations.read", "permission_changes.read", "export"),
				grant(ResourceExport, "members"),
			),
		},
	}
}

type resourceGrant struct {
	resource string
	actions  []string
}

func grant(resource string, actions ...string) resourceGrant {
	return resourceGrant{resource: resource, actions: actions}
}

func allow(grants ...resourceGrant) PermissionMatrix {
	matrix := EmptyPermissionMatrix()
	for _, item := range grants {
		if _, exists := matrix[item.resource]; !exists {
			continue
		}
		for _, actionName := range item.actions {
			if _, exists := matrix[item.resource][actionName]; exists {
				matrix[item.resource][actionName] = true
			}
		}
	}
	return matrix
}
