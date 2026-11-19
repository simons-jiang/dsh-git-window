# Git 日志窗口（dsh-git-window）

把 IDEA 的 Git 工具窗搬进 DeepSeek Harness：窗口**底部**是一条可拖拽高度的 Git 工具窗，
左边是分支树，中间是带提交图的提交历史，右边是当前提交的改动文件；**点击某个改动的文件**，
中间的编辑区会打开它的差异视图（并排 / 统一两种布局），顶部是编辑器风格的标签页。

```
┌──────────────────────────────────────────── 窗口 ────────────────────────────────────────────┐
│  侧边栏        │              对话 / 差异视图（中央编辑区）                    │  右侧栏    │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│  日志 ①   [仓库 ▾] [分支] [筛选提交] [刷新] [×]                                              │
│  分支     │  提交信息                                     │ 作者    │ 日期   │ 提交详情 + 文件   │
│  全部分支 │  ●─┬─ 本地变更 (2)                            │        │        │ 标题 / 哈希      │
│  本地(2)  │  ● │  feature/login  登录页支持记住我…             │ alice  │ 今天   │ 说明 / 文件列表   │
│  远程(5)  │    ●  fix(api): 修复分页参数为空时的报错…         │ bob    │ 昨天   │ M src/app/…ts     │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 功能

- **底部工具窗**：`shell.bottom` 全宽停靠，拖动上边缘改变高度，尺寸与开关状态本地记住；
  侧边栏底部有一个 Git 按钮随时显示 / 隐藏（隐藏时占用 0 高度）。
- **高度上限**：工具窗最高不超过视口 45%，超过时左侧栏的「工作区」区域会被挤没（宁可矮一点）。
- **统一的表面令牌**：右键菜单、提交/冲突对话框、提示条、合并窗口全部用插件面板同一套令牌
  （`--dsw-alias-bg-layer-1` / `bg-base` / `border-l1,l2` / `label-primary,secondary`），
  浅色主题下是不透明纯白，深色主题下自动变深；不使用 `--dsw-alias-bg-overlay`
  （浅色下是 `#e9ecf2` 的蓝灰，会和面板产生色差）。
- **右键范围**：分支行、全部分支行、工具栏分支 chip、日志行、详情文件、空白区域右键都打开插件自己的菜单
  （输入框保留系统菜单，方便粘贴；菜单和对话框都可以按 `Esc` 关闭）。
- **文案兜底**：所有 UI 文案走 `gwMakeTranslator` —— 先问 locale 服务，命中不了就用随包词条
  （按 locale 前缀选 zh/en），**任何情况下都不会把 `menuPull` 这类词条 key 露到界面上**。
- **分支右键菜单（对齐 IDEA）**：签出 / 与 '当前分支' 比较 / 显示与工作树的差异 /
  将所选分支合并到 '当前分支' 中 / 更新 / 推送…；
  底部另加「提交…」「提交并推送…」。存在冲突时多出「解决冲突…」，合并中还有「中止合并」。
- **比较视图**：比较结果按文件列在右侧详情里，点文件在中间打开双引用差异（`base..head` 或 `base → 工作树`）。
- **提交对话框**：提交信息 + 变更文件勾选（默认全选），按钮「提交 / 提交并推送」，
  `⌘/Ctrl+Enter` 直接提交。
- **冲突处理窗口**：三列布局 `您未提交的更改 | 结果 | 远程更改`，每个冲突块两侧有 ◀ ▶，
  可「全部接受左侧/右侧」、上下跳冲突、`接受左侧/接受右侧`，底部 `中止` / `应用更改`；
  多文件冲突用顶部标签切换；全部解决后工具窗出现「提交合并」。
- **提交历史**：提交图（按提交拓扑分列着色，合并没有折线穿插）、分支 / 远程 / 标签徽标、
  提交信息、作者、相对日期（今天 12:00 / 昨天 19:24）、按提交信息 / 作者 / 哈希即时筛选、
  分页加载更早的提交。
- **分支树**：HEAD、本地分支、远程分支；点分支把日志切到该分支（只读，不切换工作区），再点一次取消。
- **提交详情**：完整提交说明、哈希（点击复制）、作者与时间、`N 个文件 +x -y`、每个文件的
  状态字母（A/M/D/R）与增删行数。
- **本地变更**：工作区有未提交改动时，日志顶部出现「本地变更」一行，点开显示未提交文件，
  点文件看工作区差异（未跟踪文件按全新增模式显示，二进制文件给出提示）。
- **差异视图**：中央 `main` 面板，编辑器风格标签页（含「对话」返回）；并排 / 统一切换；
  整文件连续展示（不显示 `@@` 头），长段未修改默认折叠、点击展开；
  两侧独立行号、增删背景色、行内语法着色；失败可重试，超大差异标记截断。
- **多仓库与跟随项目**：下拉框列出本 Harness 里所有「已注册工作区」中的 Git 仓库。
  默认**跟随当前会话所属的项目**——点开某个项目下的会话（或在该项目新建会话），
  仓库自动切到该项目对应的 Git 仓库；在同一项目内手动选别的仓库会保留你的选择，
  直到切到另一个项目再恢复跟随。点「刷新」会重新读取仓库列表（新增/删除工作区无需刷新页面）。

## 跟随代码工作区的主题

同时装了 [`dsh-ide-window`](https://github.com/simons-jiang/dsh-ide-window) 时，本插件会**跟着它选的配色变**：
代码工作区切到「德古拉」或「IntelliJ 浅色」，这里的工具窗口同步换色，不需要单独设置。

它只读，不写：

- `localStorage['dsh-theme']` —— 当前主题 id（空 = 跟随 DSH）
- 同页 `dsh-theme` 事件（`detail.id`）—— 切换后立即生效
- 样式表来自 `/dsh-ide/theme?id=<id>`，本插件只把自己的根节点标成 `data-dsh-theme="<id>"`

没装代码工作区时样式请求 404，本插件保持 DSH 自带配色，不会报错。
实现在 `src/client/05-theme.js`，契约变更需两边同时改。

---

## 数据与安全

- **怎么读**：全部通过系统 `git` 可执行文件（`log` / `diff` / `diff-tree` / `for-each-ref` /
  `status` / `rev-parse` / `rev-list` / `show` / `ls-files`），不碰 `user.name/user.email`。
- **怎么写**（只有你点了菜单才会发生）：
  - 提交 = `git add -- <选中的文件>` + `git commit -m <消息>`；
  - 更新 = `git pull --no-rebase --no-edit`（「智能合并」= 先 `git stash push -u`，拉取后 `git stash pop`）；
  - 推送 = `git push`（无上游时 `--set-upstream <唯一远端> <分支>`，**从不 force**）；
  - 解冲突 = 写回结果 + `git add -- <文件>`；中止 = `git merge --abort`；
  - 分支菜单 = `git checkout`（远程分支会建跟踪分支）/ `git merge --no-edit`。
  - 插件自身不执行 `fetch`、不改 git 配置、不 reset、不删除/重命名分支、不改上游跟踪、不改写已推送的历史。
- **凭据**：不存储、不读取任何密码/token/SSH key。`push`/`pull` 的认证完全交给系统 git
  （credential helper / SSH agent / macOS Keychain）；子进程带 `GIT_TERMINAL_PROMPT=0`，
  拿不到凭据会立刻失败并把 git 的原始报错显示在提示条里，而不是卡住等你输入。
- **二进制冲突**：不会把解码后的字节写回文件；窗口会提示改在命令行解决。
- 路由：读 `POST /dsh-git/api/{repos|log|branches|commit|diff|status|compare}`，写
  `{commitChanges|pull|push|resolve|abortMerge|checkout|mergeBranch}`；
  全部经 `connection.requestRejection` 做 Host/Origin 与浏览器凭据校验，未通过直接 403。
- 目录限定：请求里的 `cwd` 必须是某个已注册工作区目录本身或其中的子目录（`realpath` 规范化后判定），
  文件路径必须是仓库内相对路径，`..` 与绝对路径一律拒绝。
- 输出用 `-z` / 分隔符 / `--no-color` / `core.quotePath=false` 解析，不依赖系统语言与配色。

## 目录结构

```
index.js               Host 半：git 读取 + HTTP 路由 + 目录/路径校验
platform/              平台差异层：contract + macos + windows + 选择器
client.js              浏览器半（由 build.mjs 生成，勿手改）
src/client/*.js        浏览器半的可读源码（按顺序拼接）
  00-css.js            整份样式表（主题令牌 + 差异/图语义色）
  06-platform.js       浏览器端的平台镜像（分隔符、根、大小写规则）
  10-core.js           Host API 客户端 + 共享 store
  20-graph.js          提交图分列算法与单行 SVG
  30-diff.js           hunk 配对、行内着色、并排/统一渲染
  40-dock.js           底部工具窗（分支树 + 日志表 + 提交详情）
  50-panel.js          中央差异面板 + 侧边栏开关
  90-apply.js          三个插槽注册
locale/en.json         UI 文案 + 插件标题/说明（en）
locale/zh.json         UI 文案 + 插件标题/说明（zh）
build.mjs              拼接源码、内联词条、生成 client.js
test/api-test.mjs      Host API 自测（node test/api-test.mjs <repo>）
test/platform.mjs      平台契约自测（两套实现都不能缺项）
```

## 跨平台

只支持 **macOS** 与 **Windows**。所有系统差异收在 `platform/`：

- `contract.js` 定义契约与 `PLATFORM_METHODS`；
- `macos.js` / `windows.js` 各实现一份（`getPathSeparator()`、`isCaseInsensitive()`、
  `toPosix()` / `toNative()`、`isAbsolutePath()`、`isRepoRelativePath()`、`isPathInside()`、
  `gitEnvironment()` 等；两套都按大小写不敏感比较）。
- `index.js` 按 `process.platform` 选择（非 macOS 一律按 Windows 处理）。

浏览器端在 `src/client/06-platform.js` 有一份镜像，平台事实由 Host 的 `repos` 响应下发
（首屏先按 UA 粗猜，拿到响应后以 Host 为准）；`gwRepoForPath` 等原生路径比较都走它。
新增系统 = 新增一个实现 + 在 `PLATFORM_METHODS` 登记，平台测试会强制两套实现都覆盖。

## 安装

插件管理 → 添加插件 → 安装源选「自定义地址」，粘贴下面这行再点「安装」：

```
git+https://github.com/simons-jiang/dsh-git-window.git
```

装完在 Plugins 列表里启用即可，页面底部会出现「日志」工具窗（侧边栏底部的 Git 按钮随时开关）。
不需要任何账号或 token；建议 DSH 版本大于等于 0.2.2-rc.3。

## 发布

上架流程（公开仓库 → 可选发 npm → 去 `awesome-dsh-plugin` 提一条条目 PR）、图标与截图要求、
发版清单都写在 [PUBLISHING.md](PUBLISHING.md)。

## 开发

```bash
node build.mjs                     # 重新生成 client.js
node --check index.js client.js    # 语法检查
node test/api-test.mjs ~/path/to/repo   # Host 只读接口
node test/git-actions-test.mjs          # Host 写入/冲突流程（自建一次性仓库）
node test/client-smoke.mjs              # 浏览器半离线冒烟：假 React/假 ctx 真渲染一遍
node test/platform.mjs                  # 平台契约：macOS / Windows 两套实现与契约完整性
```

`client-smoke.mjs` 不需要浏览器：它按 `window.__ModuleLoader__` 的方式加载 `client.js`，
用最小 React 替身执行四个插槽组件（工具窗 / 差异面板 / 右键菜单 / 冲突窗口），断言无异常、
无词条 key 泄露、合并三栏能建起来。升级 Harness 后先跑它，最快能发现契约变化。

改完 `client.js` 后刷新页面即可生效；改 `index.js` 需要重新加载插件（重启 Harness 或重新启用该 bundle）。

## English

A bundled Host + Web UI plugin that reproduces IDEA's Git tool window inside DeepSeek Harness:
a resizable full-width bottom dock with a branch tree, a commit graph table, per-commit changed
files, and a centre diff editor (side-by-side or unified) opened by clicking a file. Everything is
read-only `git` through the system binary, served by fenced loopback routes that only accept
directories inside the profile's registered workspaces.

## 跟随项目

仓库跟着「当前屏幕上那个会话」走：客户端订阅 `sidebarRight.mounted`（会话座位）→
用 `useWorkspaces` 的 snapshot 找到该会话所属工作区 → 取工作区路径 → 匹配已注册仓库。
若该工作区不是 Git 仓库（例如 `杂项`），仓库保持不变。
手动下拉选择会记作「当前项目的覆盖」，切换项目后自动恢复跟随。

## 常见问题：仓库从哪来、账号、加新仓库

### 1. 仓库列表从哪来

插件**不维护自己的仓库清单**，也没有自己的配置项。它读的是这个 profile 的
**工作区注册表**（当前部署里就是 `~/.dsh/storages/workspace.json`，即侧边栏「工作区」
下面那些项目），对每个工作区跑一次 `git -C <path> rev-parse --show-toplevel`：

- 是 Git 仓库 → 进列表（`title` 用工作区名，`path`/`root` 用于跟随项目时匹配）；
- 不是仓库 → 跳过。

所以列表 = 「侧边栏里看得到的项目」∩「Git 仓库」。排序按工作区最近活动时间；
点工具窗的「刷新」会重新拉一次（`POST /dsh-git/api/repos`），新增或删除工作区后
不用刷新整个页面。删除工作区后，如果它正是当前仓库，会自动回落到「当前项目」或列表第一项。

### 2. Git 账号从哪来

**插件不碰账号，也不保存任何凭据。** 它只调用系统 `git` 的本地只读命令：

`rev-parse`、`log`、`diff`、`diff-tree`、`show`、`for-each-ref`、`status`、`rev-list`、`ls-files`

从不执行 `fetch` / `pull` / `push` / `clone` / `ls-remote`，不读 `~/.gitconfig` 的
`user.name`/`user.email`，不读写 credential helper、SSH key、macOS Keychain，也不联网。
提交历史里的「作者」来自提交对象本身（`%an`/`%ae`），不是本机配置。

### 3. 以后改了 Git 密码 / token 怎么办

**不需要处理**：插件里没有任何与密码、token、SSH key 相关的缓存或配置。密码只会影响
fetch/pull/push 这类联网操作，而那些操作不在本插件范围内（仍然用你的终端或 IDE）。
如果以后要在这里加「拉取 / 推送」，方案是让系统 git 自己做认证
（credential helper / SSH agent / Keychain），插件只负责调用与展示，不落盘任何凭据。

### 4. 后续新增仓库怎么加

**把它变成一个工作区**（唯一入口，也是安全边界）：

1. 侧边栏「工作区」区域右上角的 **添加工作区**（文件夹图标）→ 选目录；
2. 或者直接在该目录里开一个会话（首屏的工作区选择器 / 「新会话」）。

之后点工具窗「刷新」就会出现；如果你是在新工作区里开的会话，还会自动跟随切过去。
**为什么必须是工作区**：`/dsh-git/api/*` 只接受「已注册工作区目录及其子目录」作为
`cwd`（`realpath` 规范化后判定），其它路径一律 403 —— 这样浏览器端无法拿这条路由去读
任意目录的 Git 数据。如果确实有不想变成工作区的仓库，可以再给插件加一个
`extraRepos: string[]` 配白名单（仍按同样的路径校验），说一声即可。

## 已知边界

- 合并窗口按「冲突块」对齐三列（每个冲突块在左/中/右三列占同一段行），冲突块内部的文本带
  各列保留自己的行号；当某一侧在冲突之外还多/少了几行时，文本带内可能有 1–2 行错位（冲突本身不受影响）。
- 「结果」列由「接受左侧/右侧」生成，不提供自由编辑（IDEA 可以在结果里直接打字）；需要手改时
  用「应用更改」写回后再在编辑器里改，或先在命令行解决。
- 一次只处理一次 merge；不提供 rebase / cherry-pick，其它操作的冲突暂未接入同一个窗口。
