"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils";

const THEMES = { light: "light", dark: "dark" } as const;

export type ChartConfig = {
  [key: string]: {
    label?: string;
    color?: string;
    icon?: React.ComponentType;
  };
};

type ChartContextProps = {
  config: ChartConfig;
  theme: keyof typeof THEMES;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }
  return context;
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
    theme?: keyof typeof THEMES;
  }
>(({ id, className, children, config, theme = "light", ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config, theme }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          chartId,
          "flex aspect-video max-h-[300px] w-full flex-col items-center justify-center [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot]:stroke-border [&_.recharts-layer]:outline-none",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} theme={theme} />
        <RechartsPrimitive.ResponsiveContainer width="100%" height="100%">
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "ChartContainer";

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig; theme: keyof typeof THEMES }) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.color
  );

  if (!colorConfig.length) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(config)
          .filter(([, config]) => config.color)
          .map(([key, itemConfig]) => {
            const color = itemConfig?.color ?? "hsl(var(--chart-1))";
            return [
              `.${id} [data-${key}] {`,
              `  color: ${color};`,
              "}",
            ].join("\n");
          })
          .join("\n"),
      }}
    />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean;
      hideIndicator?: boolean;
      indicator?: "line" | "dot" | "dashed";
      nameKey?: string;
      labelKey?: string;
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      contentStyle,
      itemStyle,
      nameKey,
      labelKey,
      ...props
    },
    ref
  ) => {
    const { config } = useChart();

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) return null;
      const [item] = payload;
      const key = item?.dataKey ?? item?.name;
      const itemConfig = getPayloadConfigFromPayload(config, item?.payload, key != null ? String(key) : undefined);
      const value =
        !labelKey && typeof label === "string"
          ? label
          : item?.payload[labelKey as string] ?? item?.payload.label;
      if (labelFormatter) {
        return labelFormatter(value, payload);
      }
      if (typeof value === "undefined") return null;
      return String(value);
    }, [label, labelFormatter, payload, hideLabel, labelKey, config]);

    if (!active || !payload?.length) return null;

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className
        )}
      >
        {tooltipLabel ? (
          <div
            className={cn(
              "font-medium text-muted-foreground",
              labelClassName
            )}
          >
            {tooltipLabel}
          </div>
        ) : null}
        <div className="grid gap-1.5">
          {payload.map((item, index) => {
            const key = item?.dataKey ?? item?.name;
            const itemConfig = getPayloadConfigFromPayload(config, item?.payload, key != null ? String(key) : undefined);
            const indicatorColor = item?.payload?.fill ?? item?.color ?? itemConfig?.color;

            return (
              <div
                key={item?.dataKey ?? index}
                className={cn(
                  "flex w-full flex-wrap items-center gap-1.5 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground"
                )}
                style={itemStyle}
              >
                {formatter && item?.value !== undefined && item?.name != null ? (
                  formatter(item.value, String(item.name), item, index, item?.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "shrink-0 rounded-[2px] border-[2px] border-current",
                            {
                              "bg-current": indicator === "dot",
                              "": indicator === "line",
                              "border-dashed bg-transparent": indicator === "dashed",
                            }
                          )}
                          style={{
                            borderColor: indicatorColor,
                            backgroundColor: indicator === "dot" ? indicatorColor : undefined,
                          }}
                        />
                      )
                    )}
                    <span className="flex-1 shrink-0 text-muted-foreground">
                      {itemConfig?.label ?? item?.name}
                    </span>
                    {item?.value != null && (
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {formatter
                          ? formatter(item.value, item.name != null ? String(item.name) : "", item, index, item?.payload)
                          : typeof item.value === "number" && itemConfig?.label?.toLowerCase().includes("percent")
                            ? `${item.value}%`
                            : String(item.value)}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
ChartTooltipContent.displayName = "ChartTooltipContent";

function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string | undefined) {
  if (key == null || key === "") return undefined;
  if (key in config) return config[key];
  return config[String(key)];
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartStyle,
};
