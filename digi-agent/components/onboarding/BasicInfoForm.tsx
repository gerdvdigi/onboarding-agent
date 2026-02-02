"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOnboardingStore } from "@/lib/store/onboarding-store";
import { useRouter } from "next/navigation";

const basicInfoSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  lastName: z.string().min(2, "Last name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
  company: z.string().min(2, "Company name is required"),
  website: z
    .string()
    .url("Invalid URL")
    .or(z.literal(""))
    .transform((val) => (val === "" ? "https://example.com" : val)),
  terms: z.boolean().refine((val) => val === true, {
    message: "You must accept the terms and conditions",
  }),
});

type BasicInfoFormData = z.infer<typeof basicInfoSchema>;

export function BasicInfoForm() {
  const router = useRouter();
  const { setUserInfo, setCurrentStep } = useOnboardingStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BasicInfoFormData>({
    resolver: zodResolver(basicInfoSchema),
    defaultValues: {
      website: "",
      terms: false,
    },
  });

  const onSubmit = (data: BasicInfoFormData) => {
    setUserInfo({
      name: data.name,
      lastName: data.lastName,
      email: data.email,
      company: data.company,
      website: data.website,
      terms: data.terms,
    });
    setCurrentStep(2);
    router.push("/onboarding/step-2");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">First name *</Label>
            <Input
                id="name"
              {...register("name")}
              placeholder="John"
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
              {...register("lastName")}
              placeholder="Doe"
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
        {isSubmitting ? "Processing..." : "Continue"}
      </Button>
    </form>
  );
}
