import { useMemo } from "react";
import { Link } from "@heroui/link";
import { Navbar as HeroUINavbar, NavbarBrand, NavbarContent, NavbarItem, NavbarMenuToggle, NavbarMenu, NavbarMenuItem } from "@heroui/navbar";
import { link as linkStyles } from "@heroui/theme";
import clsx from "clsx";

import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/theme-switch";

// 判断是否为配置面板模式
const isConfigPanelMode = import.meta.env.VITE_CONFIG_PANEL_MODE === "true";

export const Navbar = () => {
    // 配置面板模式下只显示配置页面导航
    const navItems = useMemo(() => {
        if (isConfigPanelMode) {
            return siteConfig.navItems.filter(item => item.href === "/config");
        }

        return siteConfig.navItems;
    }, []);

    const navMenuItems = useMemo(() => {
        if (isConfigPanelMode) {
            return siteConfig.navMenuItems.filter(item => item.href === "/config");
        }

        return siteConfig.navMenuItems;
    }, []);
    return (
        <HeroUINavbar maxWidth="2xl" position="sticky">
            <NavbarContent className="basis-1/5 sm:basis-full" justify="start">
                <NavbarBrand className="gap-3 max-w-fit">
                    <Link className="flex justify-start items-center gap-1" color="foreground" href="/">
                        <img alt="logo" className="w-7" src="./logo.webp" />
                        <p className="font-bold text-inherit">Synthos</p>
                    </Link>
                </NavbarBrand>
                <div className="hidden lg:flex gap-4 justify-start ml-7">
                    {navItems.map(item => (
                        <NavbarItem key={item.href}>
                            <Link className={clsx(linkStyles({ color: "foreground" }), "data-[active=true]:text-primary data-[active=true]:font-medium")} color="foreground" href={item.href}>
                                {item.label}
                            </Link>
                        </NavbarItem>
                    ))}
                </div>
            </NavbarContent>

            <NavbarContent className="hidden sm:flex basis-1/5 sm:basis-full" justify="end">
                <NavbarItem>
                    <ThemeSwitch />
                </NavbarItem>
            </NavbarContent>

            <NavbarContent className="sm:hidden basis-1 pl-4" justify="end">
                <ThemeSwitch />
                <NavbarMenuToggle />
            </NavbarContent>

            <NavbarMenu>
                <div className="mx-4 mt-2 flex flex-col gap-2">
                    {navMenuItems.map((item, index) => (
                        <NavbarMenuItem key={`${item}-${index}`}>
                            <Link color={index === 2 ? "primary" : index === navMenuItems.length - 1 ? "danger" : "foreground"} href={item.href} size="lg">
                                {item.label}
                            </Link>
                        </NavbarMenuItem>
                    ))}
                </div>
            </NavbarMenu>
        </HeroUINavbar>
    );
};
