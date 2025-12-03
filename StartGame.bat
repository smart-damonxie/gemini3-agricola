@echo off
chcp 65001 >nul
setlocal

TITLE 农场主游戏启动器 (Agricola Launcher)
color 0A

echo ========================================================
echo        正在启动 农场主 (Agricola) 游戏环境...
echo ========================================================
echo.

:: 1. 检查 Node.js 是否安装
echo [1/3] 检查 Node.js 环境...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [错误] 未检测到 Node.js！
    echo 请先访问 https://nodejs.org/ 下载安装。
    echo.
    pause
    exit
)
echo    - Node.js 已安装。

:: 2. 检查并安装依赖
echo.
echo [2/3] 检查依赖库...
if exist "node_modules\" (
    echo    - 依赖库已存在，跳过安装。(如果报错请删除 node_modules 文件夹重试)
) else (
    echo    - 首次运行，正在安装依赖 (这可能需要几分钟)...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo [错误] 依赖安装失败！请检查网络或配置。
        pause
        exit
    )
    echo    - 依赖安装完成。
)

:: 3. 智能判断启动命令 (Vite vs CRA)
echo.
echo [3/3] 正在启动游戏服务器...
echo.

:: 在 package.json 中查找 "vite" 关键字
findstr /C:"vite" package.json >nul 2>&1
if %errorlevel% equ 0 (
    echo    - 检测到 Vite 项目，运行 npm run dev...
    echo    - 游戏将在浏览器中自动打开...
    call npm run dev -- --open
) else (
    echo    - 检测到常规 React 项目，运行 npm start...
    echo    - 游戏将在浏览器中自动打开...
    call npm start
)

pause