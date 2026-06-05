import React, { useState, useEffect } from "react";
import { Button } from "@heroui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@heroui/react";

import setViewportScale from "@/util/setViewportScale";

// 自定义 Hook：监听媒体查询
function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }

        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        const media = window.matchMedia(query);

        if (media.matches !== matches) {
            setMatches(media.matches);
        }

        const listener = () => setMatches(media.matches);

        media.addEventListener("change", listener);

        return () => media.removeEventListener("change", listener);
    }, [matches, query]);

    return matches;
}

interface ResponsivePopoverProps {
    buttonText: string;
    children: React.ReactNode;
}

const ResponsivePopover: React.FC<ResponsivePopoverProps> = ({ buttonText, children }) => {
    const isSmallScreen = useMediaQuery("(max-width: 1023px)");
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (isSmallScreen) {
            setViewportScale(90);
        }
    }, [isSmallScreen]);

    if (!isSmallScreen) {
        return <>{children}</>;
    }

    return (
        <Popover isOpen={isOpen} placement="bottom" onOpenChange={setIsOpen}>
            <PopoverTrigger>
                <Button color="primary">{buttonText}</Button>
            </PopoverTrigger>
            <PopoverContent>{isOpen ? children : null}</PopoverContent>
        </Popover>
    );
};

export default ResponsivePopover;
