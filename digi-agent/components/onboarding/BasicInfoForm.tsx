"use client";

import { startTransition, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnboardingStore } from "@/lib/store/onboarding-store";
import { getApiBaseUrl, defaultFetchOptions } from "@/lib/config/api";

const basicInfoSchema = z.object({
  name: z.string().min(2, "First name is required"),
  lastName: z.string().min(2, "Last name is required"),
  email: z.string().email("Invalid email"),
  company: z.string().min(2, "Company name is required"),
  website: z
    .string()
    .url("Invalid URL")
    .or(z.literal(""))
    .transform((val) => (val === "" ? "" : val)),
  terms: z.boolean().refine((val) => val === true, {
    message: "You must accept the terms and conditions",
  }),
});

type BasicInfoFormData = z.infer<typeof basicInfoSchema>;

export function BasicInfoForm() {
  const { setUserInfo } = useOnboardingStore();
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BasicInfoFormData>({
    resolver: zodResolver(basicInfoSchema),
    defaultValues: {
      name: "",
      lastName: "",
      website: "",
      terms: false,
    },
  });

  const onSubmit = async (data: BasicInfoFormData) => {
    setSubmitError(null);
    setUserInfo({
      name: data.name,
      lastName: data.lastName,
      email: data.email,
      company: data.company,
      website: data.website || "https://example.com",
      terms: data.terms,
    });

    const res = await fetch(`${getApiBaseUrl()}/onboarding/step-1/submit`, {
      method: "POST",
      ...defaultFetchOptions,
      headers: {
        "Content-Type": "application/json",
        ...(defaultFetchOptions.headers as Record<string, string>),
      },
      body: JSON.stringify({
        name: data.name,
        lastName: data.lastName,
        email: data.email,
        company: data.company,
        website: data.website || undefined,
        terms: Boolean(data.terms),
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = body.message || "Something went wrong. Please try again.";
      startTransition(() => setSubmitError(message));
      return;
    }
    startTransition(() => setSubmitted(true));
  };

  const successContent = (
    <div className="rounded-xl border border-border bg-section-bg p-6 text-center">
      <h2 className="text-xl font-semibold text-heading">
        Check your email
      </h2>
      <p className="mt-2 text-muted-foreground">
        We sent you an access link. Click the link to continue to the next step.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        If you don&apos;t see it, check your spam folder.
      </p>
    </div>
  );

  const formContent = (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
      autoComplete="off"
    >
      {submitError != null ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {submitError}
        </p>
      ) : null}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">First name *</Label>
            <Input
              id="name"
              data-testid="first-name"
              autoComplete="off"
              {...register("name")}
              placeholder="Your first name"
              className={errors.name ? "border-red-500" : ""}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Last name *</Label>
            <Input
              id="lastName"
              data-testid="last-name"
              autoComplete="off"
              {...register("lastName")}
              placeholder="Your last name"
              className={errors.lastName ? "border-red-500" : ""}
            />
            {errors.lastName && (
              <p className="text-sm text-red-500">{errors.lastName.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            {...register("email")}
            placeholder="john@company.com"
            className={errors.email ? "border-red-500" : ""}
          />
          {errors.email && (
            <p className="text-sm text-red-500">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="company">Company name *</Label>
          <Input
            id="company"
            {...register("company")}
            placeholder="My Company Inc."
            className={errors.company ? "border-red-500" : ""}
          />
          {errors.company && (
            <p className="text-sm text-red-500">{errors.company.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="website">Website URL</Label>
          <Input
            id="website"
            type="url"
            {...register("website")}
            placeholder="https://www.company.com"
            className={errors.website ? "border-red-500" : ""}
          />
          {errors.website && (
            <p className="text-sm text-red-500">{errors.website.message}</p>
          )}
        </div>

        <div className="flex items-start space-x-2">
          <input
            type="checkbox"
            id="terms"
            {...register("terms")}
            className="mt-1 h-4 w-4 rounded border-gray-300"
          />
          <Label htmlFor="terms" className="text-sm">
            I accept the terms and conditions *
          </Label>
        </div>
        {errors.terms && (
          <p className="text-sm text-red-500">{errors.terms.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            Processing...
          </>
        ) : (
          "Continue"
        )}
      </Button>
    </form>
  );

  return submitted ? successContent : formContent;
}
