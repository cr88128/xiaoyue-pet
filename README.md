# 小悦桌宠 🐱

一个 macOS 桌面宠物应用，基于 Electron + TypeScript + Webpack 构建。短发黑白女仆装少女「小悦」常驻桌面，支持 AI 聊天、提醒、日历、多皮肤与多动作互动。

## 功能

- 🖥️ 透明无边框桌宠窗口，支持拖拽、置顶、多档缩放
- 🤖 AI 聊天（流式输出，OpenAI 兼容 API），**不同皮肤绑定不同人设**
  - 女仆小悦：称呼用户为「主人」
  - 经典小悦：邻家妹妹，称呼用户为「哥哥」
- 💋 互动动作：摸摸头、亲亲、冥想、鞠躬「主人好」、跪下「欢迎主人回来」
- 📅 读取 macOS 日历，小屋中展示今日日程
- ⏰ 提醒功能（快捷/自定义时间）
- 👗 多皮肤系统，可在小屋中一键切换
- 🗂️ 文件口袋：拖文件到桌宠上收纳
- 🖱️ 右键菜单、托盘菜单

## 技术栈

- Electron 37 + Electron Forge 7
- TypeScript + Webpack（严格 CSP，`contextIsolation` 开启）
- 素材：2048×2048 透明 PNG 动作帧（11 状态 × 5 帧）

## 开发

```bash
npm ci            # 安装依赖（macOS 需 ELECTRON_MIRROR 视网络情况而定）
npm run check     # 静态检查 + QA
npm test          # 单元测试
npm run test:dev-smoke   # 开发冒烟
npm run dev       # 源码开发预览（不打包）
```

## 打包

```bash
npm run package:mac   # 生成 .app（release/ 目录）
npm run make:mac      # 生成 DMG
```

未签名应用首次打开需在「系统设置 → 隐私与安全性」中允许。

## 皮肤说明

素材位于 `src/assets/skins/<皮肤名>/`，每个皮肤目录内按状态分子目录（idle/blink/happy/...），文件名格式 `<状态>-NN.png`。新增皮肤：

1. 在 `src/assets/skins/` 下新建目录，按同样结构放置 2048×2048 PNG
2. 在 `src/main/skin-personas.ts` 中添加对应人设（system prompt、欢迎语、称呼）
3. 在小屋 dashboard 的皮肤选择区添加按钮

## 数据存储

- 设置、提醒、聊天记录、AI 配置均保存在 Electron userData 目录（`~/Library/Application Support/小悦桌宠/`）
- API Key 使用系统安全存储加密后落盘，仅存本地，不上传

## 许可

本项目为个人项目，未经作者许可请勿用于商业用途。
