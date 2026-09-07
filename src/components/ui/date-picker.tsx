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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

export interface DatePickerProps {
    date?: Date
    onDateChange?: (date: Date | undefined) => void
    placeholder?: string
    className?: string
    showTimeInput?: boolean
}

export function DatePicker({
    date,
    onDateChange,
    placeholder = "Chọn ngày",
    className,
    showTimeInput = false,
}: DatePickerProps) {
    const [open, setOpen] = React.useState(false)

    const handleSelect = (newDate: Date | undefined) => {
        onDateChange?.(newDate)
        if (!showTimeInput) {
            setOpen(false)
        }
    }

    const formatDateDisplay = (d: Date) => {
        const day = String(d.getDate()).padStart(2, "0")
        const month = String(d.getMonth() + 1).padStart(2, "0")
        const year = d.getFullYear()
        return `${day}/${month}/${year}`
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "flex items-center justify-between gap-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all cursor-pointer text-xs font-bold text-slate-900 dark:text-white select-none group",
                        className
                    )}
                >
                    <span>{date ? formatDateDisplay(date) : placeholder}</span>
                    <ChevronDownIcon
                        className={cn(
                            "w-3.5 h-3.5 text-slate-500 transition-transform duration-200",
                            open && "rotate-180 text-pink-500"
                        )}
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                className="w-auto p-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden"
            >
                <SingleDateCalendar
                    selectedDate={date}
                    onDateChange={handleSelect}
                    showTimeInput={showTimeInput}
                    className="border-0 shadow-none"
                />
            </PopoverContent>
        </Popover>
    )
}

interface SingleDateCalendarProps {
    selectedDate?: Date
    onDateChange?: (date: Date | undefined) => void
    showTimeInput?: boolean
    className?: string
}

export function SingleDateCalendar({
    selectedDate: initialDate,
    onDateChange,
    showTimeInput = true,
    className,
}: SingleDateCalendarProps) {
    const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(initialDate)
    const [time, setTime] = React.useState("12:00 am")
    const [showTimePicker, setShowTimePicker] = React.useState(false)
    const [month, setMonth] = React.useState<Date>(selectedDate || new Date())
    const timePickerRef = React.useRef<HTMLDivElement>(null)
    const inputRef = React.useRef<HTMLInputElement>(null)

    React.useEffect(() => {
        setSelectedDate(initialDate)
        if (initialDate) setMonth(initialDate)
    }, [initialDate])

    // Close time picker when clicking outside
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (timePickerRef.current && !timePickerRef.current.contains(event.target as Node)) {
                setShowTimePicker(false)
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

    const timeOptions = parseAndGenerateOptions(time)

    const handleDateChange = (date: Date | undefined) => {
        setSelectedDate(date)
        if (date) setMonth(date)
        onDateChange?.(date)
    }

    const clearDate = () => {
        setSelectedDate(undefined)
        onDateChange?.(undefined)
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
        <div className={cn("flex gap-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden", className)}>
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
                                        handleDateChange(getPresetDate(option.value))
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

            {/* Right side with date input and calendar */}
            <div className="flex-1 p-4">
                {/* Date input field */}
                <div className="mb-4">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 flex items-center gap-2 border border-gray-300 rounded-md px-3 py-1.5 bg-white">
                            <CalendarIcon className="w-4 h-4 text-gray-400" />
                            <span className="text-sm">
                                {selectedDate ? formatDate(selectedDate) : "Select date"}
                            </span>
                            {selectedDate && (
                                <button
                                    onClick={clearDate}
                                    className="ml-auto hover:bg-gray-100 rounded p-0.5"
                                >
                                    <XIcon className="w-3 h-3 text-gray-400" />
                                </button>
                            )}
                        </div>
                        {showTimeInput && (
                            <div className="relative" ref={timePickerRef}>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={time}
                                    onChange={(e) => {
                                        setTime(e.target.value)
                                        setShowTimePicker(true)
                                    }}
                                    onFocus={() => setShowTimePicker(true)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && timeOptions.length > 0) {
                                            setTime(timeOptions[0])
                                            setShowTimePicker(false)
                                        }
                                    }}
                                    className="w-24 text-sm border border-gray-300 rounded-md px-2 py-1.5 text-center bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    placeholder="12:00 pm"
                                />
                                {showTimePicker && timeOptions.length > 0 && (
                                    <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto z-50">
                                        {timeOptions.map((option) => (
                                            <button
                                                key={option}
                                                onClick={() => {
                                                    setTime(option)
                                                    setShowTimePicker(false)
                                                    inputRef.current?.blur()
                                                }}
                                                className={cn(
                                                    "w-full px-3 py-2 text-left text-sm hover:bg-gray-100 transition-colors",
                                                    time === option && "bg-gray-100 font-medium"
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
                <div className="border-t border-gray-200 pt-4">
                    <Calendar
                        month={month}
                        onMonthChange={setMonth}
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateChange}
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
                "bg-background group/calendar [--cell-size:2.5rem]",
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
                    "flex gap-4 flex-col md:flex-row relative",
                    defaultClassNames.months
                ),
                month: cn("flex flex-col w-full gap-4", defaultClassNames.month),
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
                    "flex items-center justify-center h-10 w-full px-10",
                    defaultClassNames.month_caption
                ),
                dropdowns: cn(
                    "w-full flex items-center text-sm font-medium justify-between h-10 gap-2",
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
            data-selected={modifiers.selected}
            className={cn(
                "data-[selected=true]:bg-gray-900 data-[selected=true]:text-white",
                "hover:bg-gray-100",
                "flex aspect-square size-10 w-full",
                "items-center justify-center",
                "leading-none font-normal text-sm",
                "rounded-md transition-colors",
                defaultClassNames.day,
                className
            )}
            {...props}
        />
    )
}
