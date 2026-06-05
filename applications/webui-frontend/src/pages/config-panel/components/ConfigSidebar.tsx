/**
 * 配置侧边栏组件
 */
import type { ConfigSidebarProps } from "../types/index";

import React from "react";
import { Card, CardBody } from "@heroui/card";
import { Input } from "@heroui/input";
import { Search, X } from "lucide-react";

/**
 * 配置面板侧边栏
 * 包含搜索框和配置区域导航
 */
const ConfigSidebar: React.FC<ConfigSidebarProps> = ({ sections, activeSection, onSectionClick, searchQuery, onSearchQueryChange }) => {
    return (
        <Card className="sticky top-16 z-20 w-full lg:top-20 lg:h-[calc(100vh-6rem)] lg:w-64 lg:self-start">
            <CardBody className="flex min-h-0 flex-col gap-3 p-3 lg:h-full lg:gap-4 lg:p-4">
                {/* 搜索框 */}
                <Input
                    classNames={{
                        inputWrapper: "bg-default-100 h-9 min-h-9"
                    }}
                    endContent={
                        searchQuery ? (
                            <button className="focus:outline-none" type="button" onClick={() => onSearchQueryChange("")}>
                                <X className="w-4 h-4 text-default-400 hover:text-default-600" />
                            </button>
                        ) : null
                    }
                    placeholder="搜索配置项..."
                    size="sm"
                    startContent={<Search className="w-4 h-4 text-default-400" />}
                    value={searchQuery}
                    onChange={e => onSearchQueryChange(e.target.value)}
                />

                <div className="-mx-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:min-h-0 lg:flex-1 lg:overflow-x-hidden lg:overflow-y-auto lg:pb-0">
                    <nav className="flex gap-2 px-1 lg:block lg:space-y-1 lg:px-0">
                        {sections.map(section => (
                            <button
                                key={section.key}
                                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors lg:w-full lg:text-left ${activeSection === section.key ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-default-100"}`}
                                onClick={() => onSectionClick(section.key)}
                            >
                                <span className="mr-1.5 lg:mr-2">{section.icon}</span>
                                {section.label}
                            </button>
                        ))}
                    </nav>
                </div>
            </CardBody>
        </Card>
    );
};

export default ConfigSidebar;
