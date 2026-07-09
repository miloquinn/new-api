package model

import (
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// SmartRouter 智能路由：一个虚拟模型名（如 auto-cheap），按策略解析到候选模型列表中的具体模型。
// Strategy 可选值：
//   - cost_first: 成本优先，按估算成本从低到高选择第一个有可用渠道的模型
//   - priority:   按候选列表顺序选择第一个有可用渠道的模型（可用于"效果优先"，由管理员按质量排序）
//
// Models 使用 JSON 数组保存候选模型名，示例：["deepseek-chat", "gpt-4o-mini"]
const (
	SmartRouterStrategyCostFirst = "cost_first"
	SmartRouterStrategyPriority  = "priority"
)

type SmartRouter struct {
	Id          int       `json:"id"`
	Name        string    `json:"name" gorm:"size:64;not null;uniqueIndex:uk_smart_router_name"`
	Description string    `json:"description,omitempty" gorm:"type:varchar(255)"`
	Strategy    string    `json:"strategy" gorm:"size:32;not null"`
	Models      JSONValue `json:"models" gorm:"type:json"`
	Enabled     bool      `json:"enabled"`
	CreatedTime int64     `json:"created_time" gorm:"bigint"`
	UpdatedTime int64     `json:"updated_time" gorm:"bigint"`
}

func (r *SmartRouter) GetModelList() []string {
	if len(r.Models) == 0 {
		return nil
	}
	var models []string
	if err := common.Unmarshal(r.Models, &models); err != nil {
		common.SysError("failed to parse smart router models: " + err.Error())
		return nil
	}
	return models
}

func (r *SmartRouter) Insert() error {
	now := common.GetTimestamp()
	r.CreatedTime = now
	r.UpdatedTime = now
	if err := DB.Create(r).Error; err != nil {
		return err
	}
	LoadSmartRouterCache()
	return nil
}

func (r *SmartRouter) Update() error {
	r.UpdatedTime = common.GetTimestamp()
	if err := DB.Save(r).Error; err != nil {
		return err
	}
	LoadSmartRouterCache()
	return nil
}

func DeleteSmartRouterByID(id int) error {
	if err := DB.Delete(&SmartRouter{}, id).Error; err != nil {
		return err
	}
	LoadSmartRouterCache()
	return nil
}

func GetAllSmartRouters() ([]*SmartRouter, error) {
	var routers []*SmartRouter
	if err := DB.Model(&SmartRouter{}).Order("id ASC").Find(&routers).Error; err != nil {
		return nil, err
	}
	return routers, nil
}

func IsSmartRouterNameDuplicated(id int, name string) (bool, error) {
	if name == "" {
		return false, nil
	}
	var cnt int64
	err := DB.Model(&SmartRouter{}).Where("name = ? AND id <> ?", name, id).Count(&cnt).Error
	return cnt > 0, err
}

// 智能路由内存缓存：每个 relay 请求都要判断模型名是否为智能路由，
// 无论 MemoryCacheEnabled 与否都走缓存（数据量小），CRUD 后立即重载，
// 多节点部署下通过 SyncSmartRouterCache 周期同步。
var smartRouterCache map[string]*SmartRouter
var smartRouterCacheLock sync.RWMutex

func LoadSmartRouterCache() {
	routers, err := GetAllSmartRouters()
	if err != nil {
		common.SysError("failed to load smart routers: " + err.Error())
		return
	}
	newCache := make(map[string]*SmartRouter, len(routers))
	for _, router := range routers {
		if router.Enabled {
			newCache[router.Name] = router
		}
	}
	smartRouterCacheLock.Lock()
	smartRouterCache = newCache
	smartRouterCacheLock.Unlock()
}

func SyncSmartRouterCache(frequency int) {
	for {
		time.Sleep(time.Duration(frequency) * time.Second)
		LoadSmartRouterCache()
	}
}

// GetEnabledSmartRouterByName 返回启用状态的智能路由，不存在或未启用时返回 nil。
func GetEnabledSmartRouterByName(name string) *SmartRouter {
	smartRouterCacheLock.RLock()
	defer smartRouterCacheLock.RUnlock()
	return smartRouterCache[name]
}

func GetEnabledSmartRouters() []*SmartRouter {
	smartRouterCacheLock.RLock()
	defer smartRouterCacheLock.RUnlock()
	routers := make([]*SmartRouter, 0, len(smartRouterCache))
	for _, router := range smartRouterCache {
		routers = append(routers, router)
	}
	return routers
}
