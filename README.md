# 流量监控

macOS 菜单栏与 Windows 任务栏通知区的中国移动流量查询。当前版本连接一个手机号。

## 下载

- [macOS Apple 芯片版](https://github.com/LiNhAn-dot/mobile-data-bar/releases/latest/download/DataBar-macOS-arm64-0.1.1.zip)：解压后打开「流量监控.app」。
- [Windows x64 版](https://github.com/LiNhAn-dot/mobile-data-bar/releases/latest/download/DataBar-Windows-x64-0.1.1.zip)：解压整个目录后打开「流量监控.exe」。
- [查看发布版本](https://github.com/LiNhAn-dot/mobile-data-bar/releases)。

## 使用

1. 启动应用。Mac 在屏幕顶部菜单栏显示图标和数字，Windows 在任务栏通知区显示图标。
2. 点击图标，再点击「打开营业厅」。在中国移动官方页面完成扫码或其他验证。
3. 打开「套餐余量查询」。如果面板仍在等待，点击「刷新」。查询成功后，面板显示合计、能核对的分类和时间。
4. 右键点击图标可打开营业厅、手动刷新或退出。点击其他窗口或按 Esc 可收起详情。

程序打开时立即查询，运行期间每 20 分钟刷新一次。关闭营业厅窗口后，App 继续驻留菜单栏或通知区。再次启动时会尝试使用本机已有且有效的登录状态。若中国移动要求重新验证，需在官方页面完成扫码。网络异常时会显示上次成功查询的结果和时间。分类明细取决于当前账号的网上营业厅页面。

## 本地开发

使用 Node.js 24。安装依赖后运行：

```sh
npm ci
npm start
npm test
npm run test:desktop
```

应用运行于 Electron，营业厅登录会话和上次成功查询的流量数据保存在当前系统用户的本地应用数据目录。菜单栏和通知区只显示流量查询相关信息。

## 构建

```sh
npm run package:mac
npm run package:win
```

macOS 构建目标为 Apple 芯片。Windows 构建目标为 x64，需将整个发行目录解压后打开 `流量监控.exe`。
