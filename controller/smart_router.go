package controller

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

// GetSmartRouters 获取智能路由列表
func GetSmartRouters(c *gin.Context) {
	routers, err := model.GetAllSmartRouters()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, routers)
}

func validateSmartRouter(c *gin.Context, r *model.SmartRouter) bool {
	r.Name = strings.TrimSpace(r.Name)
	if r.Name == "" {
		common.ApiErrorMsg(c, "路由名称不能为空")
		return false
	}
	if r.Strategy != model.SmartRouterStrategyCostFirst && r.Strategy != model.SmartRouterStrategyPriority {
		common.ApiErrorMsg(c, "无效的路由策略")
		return false
	}
	models := r.GetModelList()
	if len(models) == 0 {
		common.ApiErrorMsg(c, "候选模型列表不能为空")
		return false
	}
	for _, candidate := range models {
		if strings.TrimSpace(candidate) == "" {
			common.ApiErrorMsg(c, "候选模型名不能为空")
			return false
		}
		if candidate == r.Name {
			common.ApiErrorMsg(c, "候选模型不能包含路由自身")
			return false
		}
	}
	return true
}

// CreateSmartRouter 创建智能路由
func CreateSmartRouter(c *gin.Context) {
	var r model.SmartRouter
	if err := c.ShouldBindJSON(&r); err != nil {
		common.ApiError(c, err)
		return
	}
	if !validateSmartRouter(c, &r) {
		return
	}
	if dup, err := model.IsSmartRouterNameDuplicated(0, r.Name); err != nil {
		common.ApiError(c, err)
		return
	} else if dup {
		common.ApiErrorMsg(c, "路由名称已存在")
		return
	}
	if err := r.Insert(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &r)
}

// UpdateSmartRouter 更新智能路由
func UpdateSmartRouter(c *gin.Context) {
	var r model.SmartRouter
	if err := c.ShouldBindJSON(&r); err != nil {
		common.ApiError(c, err)
		return
	}
	if r.Id == 0 {
		common.ApiErrorMsg(c, "缺少路由 ID")
		return
	}
	if !validateSmartRouter(c, &r) {
		return
	}
	if dup, err := model.IsSmartRouterNameDuplicated(r.Id, r.Name); err != nil {
		common.ApiError(c, err)
		return
	} else if dup {
		common.ApiErrorMsg(c, "路由名称已存在")
		return
	}
	if err := r.Update(); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &r)
}

// DeleteSmartRouter 删除智能路由
func DeleteSmartRouter(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteSmartRouterByID(id); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
