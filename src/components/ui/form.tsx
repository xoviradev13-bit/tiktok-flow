"use client";

import * as React from "react";
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
} from "react-hook-form";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>");
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
);

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  );
});
FormItem.displayName = "FormItem";

const FormLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField();

  return (
    <Label
      ref={ref}
      className={cn(error && "text-destructive", className)}
      htmlFor={formItemId}
      {...props}
    />
  );
});
FormLabel.displayName = "FormLabel";

const FormControl = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  return (
    <div
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  );
});
FormControl.displayName = "FormControl";

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField();

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
});
FormDescription.displayName = "FormDescription";

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message) : children;

  if (!body) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn("text-xs font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  );
});
FormMessage.displayName = "FormMessage";

/**
 * Dynamic Form Field renderer for custom dynamic schemas
 */
export const DynamicFormField = ({ field, value, onChange, error }: {
  field: any;
  value: any;
  onChange: (value: any) => void;
  error?: string;
}) => {
  const renderField = () => {
    switch (field.type) {
      case 'text':
        return (
          <Input
            type="text"
            placeholder={field.placeholder || field.name}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            maxLength={field.maxLength}
            className={error ? 'border-red-500' : ''}
          />
        );
      
      case 'email':
        return (
          <Input
            type="email"
            placeholder={field.placeholder || field.name}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className={error ? 'border-red-500' : ''}
          />
        );
      
      case 'number':
        return (
          <Input
            type="number"
            placeholder={field.placeholder || field.name}
            value={value || ''}
            onChange={(e) => onChange(Number(e.target.value))}
            min={field.min}
            max={field.max}
            className={error ? 'border-red-500' : ''}
          />
        );
      
      case 'textarea':
        return (
          <Textarea
            placeholder={field.placeholder || field.name}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            maxLength={field.maxLength}
            className={error ? 'border-red-500' : ''}
          />
        );
      
      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full rounded-md border px-3 py-2 text-sm ${error ? 'border-red-500' : ''}`}
          >
            <option value="">Select {field.name}</option>
            {field.options?.map((option: any) => {
              if (typeof option === "object" && option !== null) {
                return (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                );
              }
              return (
                <option key={option} value={option}>
                  {option}
                </option>
              );
            })}
          </select>
        );
      
      case 'multiselect':
        return (
          <div className="space-y-2">
            <select
              multiple
              value={Array.isArray(value) ? value : []}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, (option) => option.value);
                onChange(selected);
              }}
              className={`w-full rounded-md border px-3 py-2 text-sm ${error ? 'border-red-500' : ''}`}
            >
              {field.options?.map((option: any) => {
                if (typeof option === "object" && option !== null) {
                  return (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  );
                }
                return (
                  <option key={option} value={option}>
                    {option}
                  </option>
                );
              })}
            </select>
            {Array.isArray(value) && value.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {value.map((selected: string) => (
                  <Badge
                    key={selected}
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => {
                      const newValues = value.filter((v: string) => v !== selected);
                      onChange(newValues);
                    }}
                  >
                    {selected} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>
        );
      
      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map((option: any, idx: number) => {
              const isObject = typeof option === "object" && option !== null;
              const optionValue = isObject ? option.value : option;
              const optionLabel = isObject ? option.label ?? String(optionValue) : String(optionValue);
              const key = `${field.name}-${String(optionValue)}-${idx}`;
              return (
                <label key={key} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name={field.name}
                    value={optionValue}
                    checked={value === optionValue}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  <span className="text-sm">{optionLabel}</span>
                </label>
              );
            })}
          </div>
        );
      
      case 'boolean':
        return (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span className="text-sm">{field.name}</span>
          </label>
        );
      
      case 'tags':
        return (
          <div className="space-y-2">
            <Input
              type="text"
              placeholder={`Add ${field.name} (press Enter to add)`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const currentTags = Array.isArray(value) ? value : [];
                  const newTag = e.currentTarget.value.trim();
                  if (newTag && !currentTags.includes(newTag) && (!field.maxTags || currentTags.length < field.maxTags)) {
                    onChange([...currentTags, newTag]);
                    e.currentTarget.value = '';
                  }
                }
              }}
            />
            {Array.isArray(value) && value.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {value.map((tag: string, index: number) => (
                  <Badge key={index} variant="secondary" className="cursor-pointer" onClick={() => {
                    const newTags = value.filter((_: string, i: number) => i !== index);
                    onChange(newTags);
                  }}>
                    {tag} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>
        );
      
      case 'date':
        return (
          <Input
            type="date"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className={error ? 'border-red-500' : ''}
          />
        );
      
      case 'url':
        return (
          <Input
            type="url"
            placeholder={field.placeholder || field.name}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className={error ? 'border-red-500' : ''}
          />
        );
      
      case 'tel':
        return (
          <Input
            type="tel"
            placeholder={field.placeholder || field.name}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className={error ? 'border-red-500' : ''}
          />
        );
	
      case 'file':
        return (
          <div className="space-y-2">
            <Input
              type="file"
              multiple={field.multiple || false}
              accept={field.accept?.join(",")}
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                onChange(files);
              }}
              className={error ? 'border-red-500' : ''}
            />
            {Array.isArray(value) && value.length > 0 && (
              <ul className="list-disc pl-5 text-sm">
                {value.map((file: File, idx: number) => (
                  <li key={idx} className="flex items-center justify-between">
                    <span>{file.name}</span>
                    <Badge
                      variant="secondary"
                      className="cursor-pointer ml-2"
                      onClick={() => {
                        const newFiles = value.filter((_: File, i: number) => i !== idx);
                        onChange(newFiles);
                      }}
                    >
                      Remove
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {field.description && (
              <p className="text-xs text-gray-500">{field.description}</p>
            )}
          </div>
        );		  
	
      default:
        return <div>Unsupported field type: {field.type}</div>;
    }
  };

  return (
    <div className="space-y-2">
      <Label className={field.required ? "after:content-['*'] after:ml-0.5 after:text-red-500" : ""}>
        {field.name}
      </Label>
      {renderField()}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
};

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};
