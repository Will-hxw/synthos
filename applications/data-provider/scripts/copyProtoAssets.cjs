const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const assets = [
    {
        source: path.join(projectRoot, "src", "providers", "QQProvider", "parsers", "messageSegment.proto"),
        target: path.join(projectRoot, "dist", "providers", "QQProvider", "parsers", "messageSegment.proto")
    }
];

for (const asset of assets) {
    if (!fs.existsSync(asset.source)) {
        throw new Error(`找不到需要复制的资源文件：${asset.source}`);
    }

    fs.mkdirSync(path.dirname(asset.target), { recursive: true });
    fs.copyFileSync(asset.source, asset.target);
    console.log(`[data-provider] 已复制资源文件：${path.relative(projectRoot, asset.target)}`);
}
