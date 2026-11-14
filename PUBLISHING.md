# 发布到 DSH 插件市场

结论先说：**市场没有「上传」入口**。市场列表来自精选仓库
[`awesome-dsh-plugin/awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，
所以发布 = ①代码放到公开 GitHub 仓库 → ②（可选）发 npm → ③去精选仓库提一条条目 PR。
参考规则：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md>。

下面按顺序做，每一步都能单独完成。

---

## 0. 先把这个目录变成公开仓库

```bash
cd dsh-git-window
git init && git add -A
git commit -m "feat: IDEA-style Git tool window for DeepSeek Harness"
git branch -M main
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

**必须满足的三件事**（CI 会逐条检查）：

1. `package.json` 里有 `dsh.bundle.patch`（已有），并存在 `cordis.patch.yml`（已有）。
   *只声明 `dsh.client` 是不可安装的，这是最常见的被打回原因。*
2. 仓库创建满 **1 天**（PR 前几分钟新建的会被自动拒）。
3. 仓库加上 **`dsh-plugin`** topic（GitHub 仓库页 → About 齿轮 → Topics）。

还要改两处名字（`@local/` 是私有前缀，公开仓库建议用无前缀包名）：

| 文件 | 现在 | 改成 |
|---|---|---|
| `package.json` → `name` | `@local/dsh-git-window` | `dsh-git-window`（或 `@你的scope/dsh-git-window`） |
| `cordis.patch.yml` → `insert[0].name` | `@local/dsh-git-window` | 同上 |

> 你本机现在装的是 `@local/dsh-git-window` 的**链接包**，改名只发生在公开仓库那份副本上，
> 不影响本机已装好的实例。两边独立。

---

## 1.（可选，但推荐）发布 npm

不发 npm 也能被收录（市场从 GitHub 安装/构建）；发了的好处是：
**预构建安装不用走 `allowBuilds` 构建授权**，商店还能显示下载量。

```bash
npm login
npm publish --access public    # scoped 包需要 --access public
```

发之前补三个字段（`contributing.md` 里明确要求 `repository` 指回收录仓库，否则不会关联）：

```jsonc
{
  "name": "dsh-git-window",
  "version": "1.0.0",
  "description": "IDEA-style Git tool window for DeepSeek Harness",
  "repository": { "type": "git", "url": "git+https://github.com/<owner>/<repo>.git" },
  "homepage": "https://github.com/<owner>/<repo>#readme",
  "bugs": "https://github.com/<owner>/<repo>/issues",
  "author": "<你的名字>",
  "license": "MIT"
}
```

`license: MIT` 已经放进本包；如果你打算用别的协议，改这一行并补一个 `LICENSE` 文件即可。

不用 npm 的话，也建议在 GitHub Release 上挂一个预构建 tarball，并在条目里用
`tarball:` 指向它（资产名不要带版本号，否则下次发版就 404）：

```yaml
tarball: https://github.com/<owner>/<repo>/releases/latest/download/dsh-git-window.tgz
```

```bash
npm pack                                # 产出 dsh-git-window-1.0.0.tgz
gh release create v1.0.0 dsh-git-window-1.0.0.tgz   # 资产名建议重命名成不带版本的
```

---

## 2. 提一条收录 PR（这就是「上架」）

Fork `awesome-dsh-plugin/awesome-dsh-plugin`，**只新增一个文件**（不要手改 README，它们是脚本生成的）：

`data/plugins/<owner>__<repo>.yml`

```yaml
url: https://github.com/<owner>/<repo>
name: <owner>/<repo>
category: git
description:
  en: IDEA-style Git tool window for DeepSeek Harness: commit graph, branches, per-commit files, a centre diff view, pull/commit/push from the branch menu, and a three-pane merge window for conflicts.
  zh: DeepSeek Harness 的 IDEA 风格 Git 工具窗：提交图、分支、每个提交的改动文件、中间的差异视图，分支右键可拉取/提交/推送，冲突有三栏合并窗口。
# 可选：GitHub 托管的位图（png/jpg/webp），约 96px 显示；不写就用你的 GitHub 头像
icon: https://raw.githubusercontent.com/<owner>/<repo>/main/docs/icon-180.png
```

要点：

- 文件名 `<owner>__<repo>.yml`（两个下划线）；一个 PR **最多 3 条**条目。
- `description.en` 必填、必须**如实**（评审会拿描述对代码）；不要营销词；描述里出现 `: ` 要加引号。
- `category` 选 `git`（可选值见 contributing 里的列表，选错不会被打回，维护者会改）。
- **不要**在 yml 里写 `npm:`——npm 映射从 registry 自动采集，手写会被拒。
- 官方 `@deepseek-ai/*` 包要用 `peerDependencies`（本插件不依赖任何官方包，不涉及）。

PR 标题写 `Add <owner>/<repo>` 即可。CI 会按顺序检查：条目数 → `dsh.bundle` → 仓库年龄 → awesome-lint/站点构建；
失败会指出具体要改什么，往同一分支推修复就行，不用重开 PR。需要人改时维护者会打 `held: author` 标签，
改完留一条评论说明即可，标签不会自动消失（要人重新评审）。

合并后网站与市场通常一天内自动更新，你不用再做什么。

---

## 3. 商店截图（已准备好）

仓库根目录放 `screenshots.json`（已存在），列出 1–8 张仓库内图片，路径相对该文件：

```json
["docs/screenshot.jpg", "docs/screenshot-follow.jpg", "docs/screenshot-menu.jpg", "docs/screenshot-merge.jpg", "docs/screenshot-merge-resolved.jpg"]
```

规则：1–8 张；相对路径不能跳出插件目录；也可以用 GitHub 托管的 https 绝对地址；第三方图床会被拒。
不写也行——商店会从 README 里抽图，声明只是为了控制顺序。

---

## 4. 图标

- **插件面板里**用的是本包自带的 `icon.svg`（已声明 `"icon": "icon.svg"`）——这条不变，SVG 在这里没问题。
- **市场卡片**的 `icon:` **只接受位图**（png/jpg/jpeg/webp，约 96px 显示），SVG 会被拒；
  不写就回退到你的 GitHub 头像。

给卡片准备一张 PNG 放在仓库里（例如 `docs/icon-180.png`），再在条目 yml 里按上面示例引用。
把 SVG 转 PNG 一行命令即可（macOS）：

```bash
sips -s format png -z 180 180 icon.svg --out docs/icon-180.png
```

---

## 5. 不想进公共市场？（团队内部分发）

dsh 0.2.1+ 的市场支持**自建索引源**：`插件 → Discover → 索引源` 里加一个 index JSON 的 URL，
之后内部同事就能在市场里搜到并安装。适合「只给公司内部用、不公开收录」的场景。
需要的话我可以再把本仓库整理成一个可自托管的 `index.json`。

---

## 6. 发版清单（后续更新）

```bash
# 1) 改版本号（语义化：修 bug 补丁位 +1，加功能次版本 +1）
npm version patch --no-git-tag-version
node build.mjs && node --check client.js && node --check index.js
node test/api-test.mjs ~/path/to/repo && node test/git-actions-test.mjs
git commit -am "chore: release v1.0.1" && git tag v1.0.1
npm publish && git push --follow-tags
```

- 已发布过的版本号不可覆盖；发坏了只能发下一个版本。
- 改了 UI 记得重跑 `node build.mjs`（`client.js` 是产物），并更新 `docs/` 里的截图。
- 条目本身不需要改（url 不变）；描述里写了具体功能数量的话，功能变化要同步改描述。

---

## 7. 收录 ≠ 安全审查

市场 README 明确写了：收录只是形式与常识检查，不是代码审计。本插件的写操作边界（只在你点菜单时执行、
凭据交给系统 git、只允许已注册工作区内的路径、二进制冲突不写回）已经写进 README 的「数据与安全」一节，
发布前建议保持这段描述与代码一致——评审就是拿它对着代码看的。
