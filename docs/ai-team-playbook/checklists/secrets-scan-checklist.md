# 清单：敏感信息扫描检查单

> 用法：任何发布/推送/对外交付前执行。本地仓库与远端 tarball 各扫一遍，**零命中**才可继续。模式集与更多场景见根目录 `SENSITIVE-INFO-AUDIT.md`。依据：`rules/05`。

## 1. 扫描动作

- [ ] 本地仓库全量扫描（含 git 历史：`git log -p`、`git grep` 全分支）
- [ ] 远端 tarball 下载后独立扫描一次（历史提交可能有本地已删的残留）
- [ ] 打包产物/分发包扫描（zip/tar 解开扫，签名材料最容易被顺手打进去）
- [ ] 要对外发布的文档单独扫一遍（文档是泄露重灾区）

## 2. 必扫模式（出现即命中，命中即处置）

**令牌与密钥前缀**

```bash
grep -rInE 'github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+|gho_[A-Za-z0-9]+|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]+' .
```

**私钥块**

```bash
grep -rIn -- '-----BEGIN' .    # RSA/EC/OPENSSH/PGP PRIVATE KEY 全命中
```

**签名材料**

签名材料文件的扩展名扫描模式见根目录 `SENSITIVE-INFO-AUDIT.md` 第 4 类（该附录为防御性扫描工具内容，按其中 `find` 模式执行）；签名配置关键词：

```bash
grep -rInE 'storePassword|keyPassword|signingConfig' --include='*.gradle*' --include='*.properties' .
```

**密码与口令赋值**

```bash
grep -rInEi '(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["'"'"'][^"'"'"']{6,}' .
```

**内部标识与链接**（按你的组织改模式）

```bash
grep -rInE '[0-9]{18,20}' .                        # 内部平台的长数字 ID
grep -rInE 'feishu\.cn|larkoffice\.com' .          # 内部协作文档/云盘链接
grep -rInE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' .   # 邮箱
```

## 3. 命中后的处置（不等裁决，先做前两步）

- [ ] 凭据类：立即吊销/轮换（先止血，不评估「应该没人看到」）
- [ ] 签名类：身份作废换新（见 `cases/case-catgame-01-signing-leak.md`）
- [ ] 内容类（内部 ID/链接/人名）：删除或脱敏后重扫
- [ ] 记录泄露渠道并修订流程堵来路
- [ ] 教训脱敏后写入案例库

## 4. 验证方式

- [ ] 本地 + 远端 + 产物三处扫描命令的输出留档（零命中截图/日志）
- [ ] 半公开渠道（评论/聊天/日志）出现过的凭据有吊销记录
