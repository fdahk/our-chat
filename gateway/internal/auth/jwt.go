// Package auth 校验 our-chat 登录 token。网关与 Node 共享同一 HS256 密钥(JWT_SECRET),
// 握手时验签得到用户身份——身份由服务端密钥派生,绝不信任客户端自报的 userId(docs 16 §5.3)。
package auth

import (
	"errors"
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

// Identity 是验签后从 token 解出的用户身份。字段与 Node 签发的 payload 对齐:{ id, username }。
type Identity struct {
	UserID   int64
	Username string
}

// Verify 校验 HS256 token 并返回身份。任何环节失败(算法不符/签名错/过期)都返回 error,
// 调用方据此拒绝握手。强制校验 alg=HS256,杜绝 alg=none 与非对称算法混入的降级攻击。
func Verify(tokenString string, secret []byte) (Identity, error) {
	claims := jwt.MapClaims{}
	_, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("非预期的签名算法: %v", t.Header["alg"])
		}
		return secret, nil
	})
	if err != nil {
		return Identity{}, err
	}

	idRaw, ok := claims["id"]
	if !ok {
		return Identity{}, errors.New("token 缺少 id 字段")
	}
	// Node 的 jsonwebtoken 把数字 id 编为 JSON number,jwt-go 解为 float64。
	idFloat, ok := idRaw.(float64)
	if !ok {
		return Identity{}, errors.New("token 的 id 字段类型非法")
	}

	username, _ := claims["username"].(string)
	return Identity{UserID: int64(idFloat), Username: username}, nil
}
