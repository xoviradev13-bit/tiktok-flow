"use client"

import * as React from "react"
import {
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    XIcon,
    CalendarIcon,
} from "lucide-react"
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker"
import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface MultiDateCalendarProps {
    startDate?: Date
    endDate?: Date
    onStartDateChange?: (date: Date | undefined) => void
    onEndDateChange?: (date: Date | undefined) => void
    showTimeInputs?: boolean
    className?: string
}

export function MultiDateCalendar({
    startDate: initialStartDate,
    endDate: initialEndDate,
    onStartDateChange,
    onEndDateChange,
    showTimeInputs = true,
    className,
}: MultiDateCalendarProps) {
    const [startDate, setStartDate] = React.useState<Date | undefined>(initialStartDate)
    const [endDate, setEndDate] = React.useState<Date | undefined>(initialEndDate)
    const [startTime, setStartTime] = React.useState("12:00 am")
    const [endTime, setEndTime] = React.useState("12:00 am")
    const [showStartTimePicker, setShowStartTimePicker] = React.useState(false)
    const [showEndTimePicker, setShowEndTimePicker] = React.useState(false)
    const [month, setMonth] = React.useState<Date>(startDate || endDate || new Date())
    const [activeField, setActiveField] = React.useState<'start' | 'end'>(initialEndDate ? 'end' : 'start')
    const startTimePickerRef = React.useRef<HTMLDivElement>(null)
    const endTimePickerRef = React.useRef<HTMLDivElement>(null)
    const startTimeInputRef = React.useRef<HTMLInputElement>(null)
    const endTimeInputRef = React.useRef<HTMLInputElement>(null)

    // Close time pickers when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (startTimePickerRef.current && !startTimePickerRef.current.contains(event.target as Node)) {
                setShowStartTimePicker(false)
            }
            if (endTimePickerRef.current && !endTimePickerRef.current.contains(event.target as Node)) {
                setShowEndTimePicker(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    // Generate time options in 15-minute intervals
    const generateTimeOptions = () => {
        const times: string[] = []
        for (let hour = 0; hour < 24; hour++) {
            for (let minute = 0; minute < 60; minute += 15) {
                const period = hour >= 12 ? "pm" : "am"
                const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
                const displayMinute = minute.toString().padStart(2, "0")
                times.push(`${displayHour}:${displayMinute} ${period}`)
            }
        }
        return times
    }

    const allTimeOptions = generateTimeOptions()

    // Parse user input and generate custom time if valid
    const parseAndGenerateOptions = (input: string): string[] => {
        const filtered = allTimeOptions.filter(option =>
            option.toLowerCase().includes(input.toLowerCase())
        )

        // Check if input matches time pattern (e.g., "12:13", "1:30 pm", "2:45")
        const timePattern = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i
        const match = input.match(timePattern)

        if (match) {
            const [, hourStr, minuteStr, period] = match
            const hour = parseInt(hourStr)
            const minute = parseInt(minuteStr)

            if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
                const customOptions: string[] = []

                // If no period specified, show both am and pm options
                if (!period) {
                    customOptions.push(`${hour}:${minuteStr} am`)
                    customOptions.push(`${hour}:${minuteStr} pm`)
                } else {
                    customOptions.push(`${hour}:${minuteStr} ${period.toLowerCase()}`)
                }

                // Return custom options first, then filtered standard options
                return [...customOptions, ...filtered.filter(opt => !customOptions.includes(opt))]
            }
        }

        return filtered
    }

    const startTimeOptions = parseAndGenerateOptions(startTime)
    const endTimeOptions = parseAndGenerateOptions(endTime)

    const handleStartDateChange = (date: Date | undefined) => {
        setStartDate(date)
        if (date) setMonth(date)
        onStartDateChange?.(date)
    }

    const handleEndDateChange = (date: Date | undefined) => {
        setEndDate(date)
        if (date) setMonth(date)
        onEndDateChange?.(date)
    }

    const clearStartDate = () => {
        setStartDate(undefined)
        onStartDateChange?.(undefined)
    }

    const clearEndDate = () => {
        setEndDate(undefined)
        onEndDateChange?.(undefined)
    }

    const getPresetDate = (preset: string): Date => {
        const today = new Date()
        const result = new Date(today)

        switch (preset) {
            case "today":
                return result
            case "tomorrow":
                result.setDate(today.getDate() + 1)
                return result
            case "this-weekend":
                const day = today.getDay()
                const daysUntilSaturday = (6 - day + 7) % 7
                result.setDate(today.getDate() + daysUntilSaturday)
                return result
            case "next-week":
                const daysUntilMonday = ((1 - today.getDay() + 7) % 7) + 7
                result.setDate(today.getDate() + daysUntilMonday)
                return result
            case "next-weekend":
                const daysToNextSaturday = ((6 - today.getDay() + 7) % 7) + 7
                result.setDate(today.getDate() + daysToNextSaturday)
                return result
            case "2-weeks":
                result.setDate(today.getDate() + 14)
                return result
            case "4-weeks":
                result.setDate(today.getDate() + 28)
                return result
            default:
                return result
        }
    }

    const formatPresetDate = (date: Date): string => {
        const today = new Date()
        const diffTime = date.getTime() - today.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (diffDays === 0) return "Today"
        if (diffDays === 1) return "Tomorrow"

        const dayName = date.toLocaleDateString("en-US", { weekday: "short" })
        return dayName
    }

    const formatDate = (date: Date): string => {
        return date.toLocaleDateString("en-US", {
            month: "numeric",
            day: "numeric",
            year: "2-digit"
        })
    }

    const presetOptions = [
        { label: "Today", value: "today" },
        { label: "Later", value: "later", time: true },
        { label: "Tomorrow", value: "tomorrow" },
        { label: "This weekend", value: "this-weekend" },
        { label: "Next week", value: "next-week" },
        { label: "Next weekend", value: "next-weekend" },
        { label: "2 weeks", value: "2-weeks" },
        { label: "4 weeks", value: "4-weeks" },
    ]

    return (
        <div className={cn("flex gap-0 bg-white", className)}>
            {/* Left sidebar with presets */}
            <div className="w-48 border-r border-gray-200 bg-gray-50">
                <div className="py-2">
                    {presetOptions.map((option) => {
                        const date = option.value === "later" ? new Date() : getPresetDate(option.value)
                        const dateLabel = option.value === "later" ? formatPresetDate(new Date()) : formatPresetDate(date)

                        return (
                            <button
                                key={option.value}
                                onClick={() => {
                                    if (option.value !== "later") {
                                        const date = getPresetDate(option.value)
                                        if (activeField === 'start') {
                                            handleStartDateChange(date)
                                        } else {
                                            handleEndDateChange(date)
                                        }
                                    }
                                }}
                                className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center justify-between text-sm transition-colors"
                            >
                                <span className="text-gray-700">{option.label}</span>
                                <span className="text-gray-500 text-xs">
                                    {option.time ? "1:07 am" : dateLabel}
                                </span>
                            </button>
                        )
                    })}
                    <button className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center justify-between text-sm transition-colors border-t border-gray-200 mt-2 pt-4">
                        <span className="text-gray-700">Set Recurring</span>
                        <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                    </button>
                </div>
            </div>

            {/* Right side with date inputs and calendar */}
            <div className="flex-1 p-3">
                {/* Date input fields */}
                <div className="mb-1.5 space-y-1.5">
                    {/* Start date */}
                    <div className="flex items-center gap-2">
                        <div
                            className={cn(
                                "flex-1 flex items-center gap-2 border rounded-md px-3 py-1 bg-white cursor-pointer transition-all",
                                activeField === 'start' ? "border-blue-500 ring-2 ring-blue-500/20" : "border-zinc-200 bg-zinc-50/30 hover:bg-zinc-50"
                            )}
                            onClick={() => setActiveField('start')}
                        >
                            <CalendarIcon className="w-4 h-4 text-gray-400" />
                            <span className={cn("text-sm", !startDate && "text-gray-400")}>
                                {startDate ? formatDate(startDate) : "Start date"}
                            </span>
                            {startDate && (
                                <button
                                    onClick={clearStartDate}
                                    className="ml-auto hover:bg-gray-100 rounded p-0.5"
                                >
                                    <XIcon className="w-3 h-3 text-gray-400" />
                                </button>
                            )}
                        </div>
                        {showTimeInputs && (
                            <div className="relative" ref={startTimePickerRef}>
                                <input
                                    ref={startTimeInputRef}
                                    type="text"
                                    value={startTime}
                                    onChange={(e) => {
                                        setStartTime(e.target.value)
                                        setShowStartTimePicker(true)
                                    }}
                                    onFocus={() => setShowStartTimePicker(true)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && startTimeOptions.length > 0) {
                                            setStartTime(startTimeOptions[0])
                                            setShowStartTimePicker(false)
                                        }
                                    }}
                                    className="w-24 text-xs border border-zinc-200 rounded-md px-2 py-1.5 text-center bg-zinc-50/30 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-zinc-600"
                                    placeholder="12:00 am"
                                />
                                {showStartTimePicker && startTimeOptions.length > 0 && (
                                    <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto z-50">
                                        {startTimeOptions.map((option) => (
                                            <button
                                                key={option}
                                                onClick={() => {
                                                    setStartTime(option)
                                                    setShowStartTimePicker(false)
                                                    startTimeInputRef.current?.blur()
                                                }}
                                                className={cn(
                                                    "w-full px-3 py-2 text-left text-sm hover:bg-gray-100 transition-colors",
                                                    startTime === option && "bg-gray-100 font-medium"
                                                )}
                                            >
                                                {option}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* End date */}
                    <div className="flex items-center gap-2">
                        <div
                            className={cn(
                                "flex-1 flex items-center gap-2 border rounded-md px-3 py-1 bg-white cursor-pointer transition-all",
                                activeField === 'end' ? "border-blue-500 ring-2 ring-blue-500/20" : "border-zinc-200 bg-zinc-50/30 hover:bg-zinc-50"
                            )}
                            onClick={() => setActiveField('end')}
                        >
                            <CalendarIcon className="w-4 h-4 text-gray-400" />
                            <span className={cn("text-sm", !endDate && "text-gray-400")}>
                                {endDate ? formatDate(endDate) : "Due date"}
                            </span>
                            {endDate && (
                                <button
                                    onClick={clearEndDate}
                                    className="ml-auto hover:bg-gray-100 rounded p-0.5"
                                >
                                    <XIcon className="w-3 h-3 text-gray-400" />
                                </button>
                            )}
                        </div>
                        {showTimeInputs && (
                            <div className="relative" ref={endTimePickerRef}>
                                <input
                                    ref={endTimeInputRef}
                                    type="text"
                                    value={endTime}
                                    onChange={(e) => {
                                        setEndTime(e.target.value)
                                        setShowEndTimePicker(true)
                                    }}
                                    onFocus={() => setShowEndTimePicker(true)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && endTimeOptions.length > 0) {
                                            setEndTime(endTimeOptions[0])
                                            setShowEndTimePicker(false)
                                        }
                                    }}
                                    className="w-24 text-xs border border-zinc-200 rounded-md px-2 py-1.5 text-center bg-zinc-50/30 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium text-zinc-600"
                                    placeholder="12:00 am"
                                />
                                {showEndTimePicker && endTimeOptions.length > 0 && (
                                    <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto z-50">
                                        {endTimeOptions.map((option) => (
                                            <button
                                                key={option}
                                                onClick={() => {
                                                    setEndTime(option)
                                                    setShowEndTimePicker(false)
                                                    endTimeInputRef.current?.blur()
                                                }}
                                                className={cn(
                                                    "w-full px-3 py-2 text-left text-sm hover:bg-gray-100 transition-colors",
                                                    endTime === option && "bg-gray-100 font-medium"
                                                )}
                                            >
                                                {option}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Calendar */}
                <div className="border-t border-gray-200 pt-1">
                    <Calendar
                        month={month}
                        onMonthChange={setMonth}
                        mode="single"
                        selected={activeField === 'start' ? startDate : endDate}
                        onSelect={activeField === 'start' ? handleStartDateChange : handleEndDateChange}
                        className="w-full"
                    />
                </div>
            </div>
        </div>
    )
}

function Calendar({
    className,
    classNames,
    showOutsideDays = true,
    captionLayout = "dropdown-months",
    buttonVariant = "ghost",
    formatters,
    components,
    ...props
}: React.ComponentProps<typeof DayPicker> & {
    buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
    const defaultClassNames = getDefaultClassNames()

    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn(
                "bg-background group/calendar [--cell-size:2.15rem]",
                className
            )}
            captionLayout={captionLayout}
            formatters={{
                formatMonthDropdown: (date) =>
                    date.toLocaleString("default", { month: "long", year: "numeric" }),
                ...formatters,
            }}
            classNames={{
                root: cn("w-full", defaultClassNames.root),
                months: cn(
                    "flex gap-2 flex-col md:flex-row relative",
                    defaultClassNames.months
                ),
                month: cn("flex flex-col w-full gap-2", defaultClassNames.month),
                nav: cn(
                    "flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between z-10",
                    defaultClassNames.nav
                ),
                button_previous: cn(
                    buttonVariants({ variant: buttonVariant }),
                    "size-8 aria-disabled:opacity-50 p-0 select-none hover:bg-gray-100",
                    defaultClassNames.button_previous
                ),
                button_next: cn(
                    buttonVariants({ variant: buttonVariant }),
                    "size-8 aria-disabled:opacity-50 p-0 select-none hover:bg-gray-100",
                    defaultClassNames.button_next
                ),
                month_caption: cn(
                    "flex items-center justify-center h-8 w-full px-10",
                    defaultClassNames.month_caption
                ),
                dropdowns: cn(
                    "w-full flex items-center text-[13px] font-medium justify-between h-8 gap-2",
                    defaultClassNames.dropdowns
                ),
                dropdown_root: cn(
                    "relative has-focus:border-gray-300 border border-gray-200 rounded-md bg-white",
                    defaultClassNames.dropdown_root
                ),
                dropdown: cn(
                    "absolute bg-white inset-0 opacity-0 cursor-pointer",
                    defaultClassNames.dropdown
                ),
                caption_label: cn(
                    "select-none font-medium text-sm",
                    "rounded-md pl-3 pr-2 flex items-center gap-1.5 text-gray-700 h-8 min-w-[140px]",
                    "[&>svg]:text-gray-400 [&>svg]:size-4",
                    defaultClassNames.caption_label
                ),
                month_grid: "w-full border-collapse mt-2",
                weekdays: cn("flex", defaultClassNames.weekdays),
                weekday: cn(
                    "text-gray-500 rounded-md flex-1 font-normal text-xs text-center select-none uppercase",
                    "w-10 h-8 flex items-center justify-center",
                    defaultClassNames.weekday
                ),
                week: cn("flex w-full mt-0.5", defaultClassNames.week),
                day: cn(
                    "relative w-full h-full p-0 text-center group/day aspect-square select-none",
                    "flex items-center justify-center",
                    defaultClassNames.day
                ),
                range_start: cn(
                    "rounded-md bg-accent",
                    defaultClassNames.range_start
                ),
                range_middle: cn("rounded-none", defaultClassNames.range_middle),
                range_end: cn("rounded-md bg-accent", defaultClassNames.range_end),
                today: cn(
                    "bg-red-500 text-white rounded-full font-semibold",
                    "data-[selected=true]:bg-gray-900 data-[selected=true]:text-white",
                    defaultClassNames.today
                ),
                outside: cn(
                    "text-gray-300 aria-selected:text-gray-300",
                    defaultClassNames.outside
                ),
                disabled: cn(
                    "text-gray-300 opacity-50",
                    defaultClassNames.disabled
                ),
                hidden: cn("invisible", defaultClassNames.hidden),
                ...classNames,
            }}
            components={{
                Root: ({ className, rootRef, ...props }) => {
                    return (
                        <div
                            data-slot="calendar"
                            ref={rootRef}
                            className={cn(className)}
                            {...props}
                        />
                    )
                },
                Chevron: ({ className, orientation, ...props }) => {
                    if (orientation === "left") {
                        return (
                            <ChevronLeftIcon className={cn("size-4", className)} {...props} />
                        )
                    }

                    if (orientation === "right") {
                        return (
                            <ChevronRightIcon
                                className={cn("size-4", className)}
                                {...props}
                            />
                        )
                    }

                    return (
                        <ChevronDownIcon className={cn("size-3.5", className)} {...props} />
                    )
                },
                DayButton: CalendarDayButton,
                WeekNumber: ({ children, ...props }) => {
                    return (
                        <td {...props}>
                            <div className="flex size-10 items-center justify-center text-center">
                                {children}
                            </div>
                        </td>
                    )
                },
                ...components,
            }}
            {...props}
        />
    )
}

function CalendarDayButton({
    className,
    day,
    modifiers,
    ...props
}: React.ComponentProps<typeof DayButton>) {
    const defaultClassNames = getDefaultClassNames()

    const ref = React.useRef<HTMLButtonElement>(null)
    React.useEffect(() => {
        if (modifiers.focused) ref.current?.focus()
    }, [modifiers.focused])

    return (
        <Button
            ref={ref}
            variant="ghost"
            size="icon"
            data-day={day.date.toLocaleDateString()}
            data-selected-single={
                modifiers.selected &&
                !modifiers.range_start &&
                !modifiers.range_end &&
                !modifiers.range_middle
            }
            data-range-start={modifiers.range_start}
            data-range-end={modifiers.range_end}
            data-range-middle={modifiers.range_middle}
            className={cn(
                "data-[selected-single=true]:bg-gray-900 data-[selected-single=true]:text-white",
                "data-[range-middle=true]:bg-gray-100",
                "data-[range-start=true]:bg-gray-900 data-[range-start=true]:text-white",
                "data-[range-end=true]:bg-gray-900 data-[range-end=true]:text-white",
                "hover:bg-gray-100",
                "flex aspect-square size-8 w-full",
                "items-center justify-center",
                "leading-none font-normal text-sm",
                "rounded-md transition-colors",
                "data-[selected-single=true]:rounded-md",
                "data-[range-end=true]:rounded-md",
                "data-[range-start=true]:rounded-md",
                "data-[range-middle=true]:rounded-none",
                defaultClassNames.day,
                className
            )}
            {...props}
        />
    )
}
