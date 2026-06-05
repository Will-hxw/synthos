import "reflect-metadata";
import ConfigManagerService from "@root/common/services/config/ConfigManagerService";
import Logger from "@root/common/util/Logger";
import ngrok from "ngrok";
import { Disposable } from "@root/common/util/lifecycle/Disposable";
import { mustInitBeforeUse } from "@root/common/util/lifecycle/mustInitBeforeUse";

const DEFAULT_PUBLIC_TUNNEL_TARGET_PORT = 3011;

@mustInitBeforeUse
export class NgrokClient extends Disposable {
    private urlForFE = "";
    private urlForBE = "";
    private LOGGER = Logger.withTag("NgrokClient");

    public async init() {
        const config = await ConfigManagerService.getCurrentConfig();

        if (!config.webUI_Forwarder.enabled) {
            this.LOGGER.warning("Ngrok客户端未在配置文件中启用, 跳过初始化");

            return;
        }

        this.LOGGER.info(`Ngrok客户端（前端）正在初始化...`);
        try {
            const frontendTargetAddr = this._resolveFrontendTargetAddr();

            this.urlForFE = await ngrok.connect({
                authtoken: config.webUI_Forwarder.authTokenForFE,
                proto: "http",
                addr: frontendTargetAddr
            });
            this.LOGGER.success(`Ngrok客户端（前端）初始化成功, urlForFE: ${this.urlForFE}`);
        } catch (e) {
            this.LOGGER.error(`Ngrok客户端初始化失败, 错误信息: ${e}`);
        }

        this.LOGGER.info(`Ngrok客户端（后端）正在初始化...`);
        try {
            this.urlForBE = await ngrok.connect({
                proto: "http",
                authtoken: config.webUI_Forwarder.authTokenForBE,
                addr: config.webUI_Backend.port
            });
            this.LOGGER.success(`Ngrok客户端（后端）初始化成功, urlForBE: ${this.urlForBE}`);
        } catch (e) {
            this.LOGGER.error(`Ngrok客户端初始化失败, 错误信息: ${e}`);
        }

        this._registerDisposableFunction(async () => {
            await ngrok.disconnect(); // 断开所有连接
            this.LOGGER.success("Ngrok客户端已关闭");
        });
    }

    /**
     * 复用 public tunnel 脚本的前端目标地址约定，默认保持 legacy dev:forwarder 的 3011 端口。
     */
    private _resolveFrontendTargetAddr(): string | number {
        const targetPort = this._resolveFrontendTargetPort();
        const targetHost = process.env.SYNTHOS_PUBLIC_TUNNEL_TARGET_HOST;

        if (!targetHost || targetHost.trim() === "") {
            return targetPort;
        }

        return `${targetHost.trim()}:${targetPort}`;
    }

    /**
     * 解析 SYNTHOS_PUBLIC_TUNNEL_TARGET_PORT，和 scripts/startPublicTunnel.cjs 使用同一变量名。
     */
    private _resolveFrontendTargetPort(): number {
        const rawPort = process.env.SYNTHOS_PUBLIC_TUNNEL_TARGET_PORT;

        if (!rawPort || rawPort.trim() === "") {
            return DEFAULT_PUBLIC_TUNNEL_TARGET_PORT;
        }

        const targetPort = Number(rawPort);

        if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
            throw new Error(`SYNTHOS_PUBLIC_TUNNEL_TARGET_PORT 必须是 1 到 65535 之间的整数，当前值: ${rawPort}`);
        }

        return targetPort;
    }
}
