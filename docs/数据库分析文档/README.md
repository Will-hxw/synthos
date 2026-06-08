# QQ NT 客户端数据库分析参考文档

> **版本**: 2025-06 社区版（持续更新中）
> **适用平台**: Android / Windows / macOS / Linux / iOS（各平台数据库结构基本一致）
> **适用版本**: QQ NT 架构（QQ 9.x+）

---

## 1. 关于本文档

本文档是对 QQ NT 架构客户端本地 SQLite 数据库结构的逆向分析参考，综合以下权威来源交叉验证整理而成：

| 来源 | 说明 |
|:---|:---|
| [QQDecrypt 官方文档](https://qqbackup.github.io/QQDecrypt/view/db_file_analysis) | 社区维护的 QQ 数据库解密与解析文档站，持续更新 |
| [linux.do 社区分析帖](https://linux.do/t/topic/416092) | 由 shenapex 发起的社区协作逆向分析 |
| [qq-win-db-key](https://github.com/QQBackup/qq-win-db-key) | QQ NT Windows 平台数据库密钥提取工具 |
| [QQNT-Database-Export-Tool](https://github.com/star-picker/QQNT-Database-Export-Tool) | 独立实现的数据库导出工具，验证了表结构 |
| [nt_msg.py](https://github.com/BrokenC1oud/nt_msg.py) | Python ORM 方式实现的 QQ 数据库解析库 |
| [qq-dump-db](https://github.com/NapNeko/qq_dump_db) | 数据库内容读取与导出工具 |
| [GroupChatAnnualReport](https://github.com/mobyw/GroupChatAnnualReport) | 群聊年度报告项目（早期字段分析来源） |
| [失迹の博客](https://blog.reincarnatey.net/2024/0707-qqnt-history-export/) | QQNT 聊天记录导出学习笔记 |

**声明**：以下信息均通过社区逆向分析推断而来，可能存在未发现或错误分析的结果。本文档已尽可能交叉验证，但仍可能有偏差——欢迎指正。

---

## 2. 术语约定

| 术语 | 说明 |
|:---|:---|
| `uin` | QQ 号，数字 ID |
| `nt_uid` | QQ NT 架构的用户唯一标识（字符串），对应 `nt_uid_mapping_table` |
| `peeruid` | 会话 ID（群号或对方 nt_uid） |
| `peeruin` | 会话 ID（群号 QQ 号形式，仅群聊） |
| `{QQ_path_hash}` | Android 端用于混淆路径的哈希值 |
| `{MD5}` | macOS 端用于混淆路径的 MD5 值 |
| `{uin}` | 用户 QQ 号 |
| 时间戳 | 如无特别说明，均为秒级 Unix 时间戳（UTC+8） |
| Protobuf | Protocol Buffers 二进制序列化格式 |

---

## 3. 数据库存储路径

### 3.1 Android

```
/data/user/0/com.tencent.mobileqq/databases/nt_db/nt_qq_{QQ_path_hash}/
```

### 3.2 Windows

```
%USERPROFILE%\Documents\Tencent Files\{uin}\nt_qq\nt_db\
```

### 3.3 macOS

```
~/Library/Containers/com.tencent.qq/Data/Library/Application Support/QQ/nt_qq_{MD5}/nt_db/
```

### 3.4 Linux

```
~/.config/QQ/nt_qq_{MD5}/nt_db/
```

---

## 4. 文档目录

| 文件 | 内容 |
|:---|:---|
| [01-数据库解密与修复](./01-数据库解密与修复.md) | 各平台数据库密钥获取、SQLCipher 解密、数据库修复方法 |
| [02-nt_msg.db-核心聊天数据库](./02-nt_msg.db-核心聊天数据库.md) | `group_msg_table`、`c2c_msg_table` 列定义、枚举值（chatType / msgType / subMsgType / sendType / @状态） |
| [03-Protobuf消息格式](./03-Protobuf消息格式.md) | 消息内容 Protobuf 字段结构、elementType 枚举、常见消息组合 |
| [04-profile_info.db-联系人信息](./04-profile_info.db-联系人信息.md) | 好友列表、好友请求、分组、用户信息 |
| [05-group_info.db-群聊信息](./05-group_info.db-群聊信息.md) | 群成员、群公告、群通知、精华消息、群详情 |
| [06-其他数据库](./06-其他数据库.md) | emoji.db / collection.db / files_in_chat.db / rich_media.db / misc.db |
| [参考文章](./参考文章.md) | 原始参考链接与致谢 |

---

## 5. 数据库文件一览

| 状态 | 数据库文件 | 说明 |
|:---:|:---|:---|
| 🔵 | `nt_msg.db` | **核心**：聊天数据（群聊 + 私聊），体积最大 |
| 🔵 | `profile_info.db` | 联系人信息（好友列表、分组、用户资料） |
| ✅ | `group_info.db` | 群聊信息（成员、公告、通知、精华） |
| 🔵 | `files_in_chat.db` | 媒体文件信息（下载的图片/视频/文件路径） |
| 🔵 | `collection.db` | QQ 收藏数据 |
| 🔵 | `rich_media.db` | 群聊/私聊发送或接收的文件信息 |
| ✅ | `emoji.db` | 表情包数据（系统表情、收藏表情、原创表情市场） |
| 🔵 | `guild_msg.db` | 频道聊天数据 |
| 🔵 | `file_assistant.db` | 文件助手已下载文件数据 |
| 🔵 | `misc.db` | 杂项数据 |
| 🔵 | `recent_contact.db` | 推测为黑名单（待进一步验证） |
| ❓ | `gpro_v1-6_{nt_uid}.db` | 暂未实现数据库解密，无法分析 |
| ✅ | `group_msg_fts.db` | 本地全文搜索索引（FTS） |
| ✅ | `data_line_msg_fts.db` | 本地全文搜索索引（FTS） |
| ✅ | `buddy_msg_fts.db` | 本地全文搜索索引（FTS） |
| ✅ | `discuss_msg_fts.db` | 本地全文搜索索引（FTS） |
| ✅ | `msg_fts.db` | 本地全文搜索索引（FTS） |
| ✅ | `rdelivery.db` | 未发现有效信息 |
| ✅ | `settings.db` | 有效信息很少，不再分析 |
| ✅ | `yffm.db` | 未发现有效信息 |

**图例**：
- 🔵 存在有效信息，有待继续分析
- ✅ 已完成表名分析
- ❓ 因技术原因暂无法分析

> 注：`*_fts.db` 系列文件为 FTS（Full-Text Search）全文搜索索引，由 QQ 自动维护，无需手动解析。已删除的数据库中未发现有意义数据。

---

## 6. 与项目代码的关系

本项目 `applications/data-provider/src/providers/QQProvider/` 下的代码实现了从 QQ NT 数据库读取并解析聊天消息的功能：

| 文件 | 职责 |
|:---|:---|
| `QQProvider.ts` | 从解密后的 `nt_msg.db` 读取群聊消息 |
| `parsers/MessagePBParser.ts` | 解析消息内容 Protobuf 二进制 |
| `parsers/messageSegment.proto` | 消息段 Protobuf 结构定义 |
| `@types/mappers/GroupMsgColumn.ts` | `group_msg_table` 列名映射常量 |
| `@types/mappers/MsgType.ts` | 消息类型枚举 |
| `@types/mappers/MsgElementType.ts` | 消息元素类型枚举 |
| `policies/QQMessageTypePolicy.ts` | 消息类型过滤策略 |
