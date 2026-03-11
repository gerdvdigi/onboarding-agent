import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden" aria-label="Hero">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28 md:px-8">
          <div className="text-center space-y-6">
            <p className="text-sm font-medium text-primary uppercase tracking-wider">
              Whatever your size, sector, or stage of growth
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-heading md:text-6xl lg:text-7xl text-balance">
              Unlock the power of HubSpot onboarding
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
              Discover how to optimize your HubSpot implementation with a plan
              tailored to your needs. Guided answers in minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <Button asChild size="lg">
                <Link href="/sign-up">Get started</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section
        className="bg-section-bg py-12 md:py-16"
        aria-label="Statistics"
      >
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <p className="text-center text-sm text-muted-foreground mb-10">
            Powered by leading HubSpot implementations
          </p>
          <div className="grid gap-8 md:grid-cols-3 text-center">
            <div>
              <p className="text-3xl md:text-4xl font-bold text-heading">
                100+
              </p>
              <p className="mt-1 text-muted-foreground">Companies onboarded</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-heading">
                Personalized
              </p>
              <p className="mt-1 text-muted-foreground">Implementation plans</p>
            </div>
            <div>
              <p className="text-3xl md:text-4xl font-bold text-heading">
                Guided
              </p>
              <p className="mt-1 text-muted-foreground">Discovery process</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        className="py-16 md:py-24"
        aria-label="How it works"
      >
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-heading text-center mb-4">
            The power of your data with Digifianz
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
            Keep your HubSpot implementation organized under one roof. Get
            recommendations, plans, and next steps quickly and efficiently.
          </p>
          <div className="grid gap-8 md:grid-cols-3">
            <Card className="border border-border bg-card transition-colors hover:border-primary/30">
              <CardHeader>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Discovery chat
                </p>
                <ul className="space-y-2 text-sm text-muted-foreground mt-2">
                  <li className="flex items-center gap-2">
                    <span className="text-success">●</span> Marketing Hub
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-success">●</span> Sales Hub
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-success">●</span> Service Hub
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-muted-foreground/50">○</span> CMS Hub
                  </li>
                </ul>
              </CardHeader>
              <CardContent>
                <h3 className="font-semibold text-heading">
                  Guided Discovery
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  A conversational assistant guides you to understand your goals
                  and recommend the right hubs and modules.
                </p>
              </CardContent>
            </Card>
            <Card className="border border-border bg-card transition-colors hover:border-primary/30">
              <CardHeader>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Your plan
                </p>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="font-medium text-heading">Implementation Plan</p>
                  <p className="text-muted-foreground">PDF ready to download</p>
                  <p className="text-success text-xs font-medium">3 modules</p>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="font-semibold text-heading">
                  Personalized Plan
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Get an implementation plan with concrete recommendations and a
                  downloadable PDF to share with your team.
                </p>
              </CardContent>
            </Card>
            <Card className="border border-border bg-card transition-colors hover:border-primary/30">
              <CardHeader>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Progress
                </p>
                <div className="mt-2 space-y-2">
                  <Progress value={75} className="h-2" />
                  <p className="text-sm text-muted-foreground">75% complete</p>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="font-semibold text-heading">Implementation</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Track your implementation progress with clear next steps and
                  milestones.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Our Features */}
      <section
        id="features"
        className="bg-section-bg py-16 md:py-24"
        aria-label="Features"
      >
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-heading text-center mb-4">
            Explore the standout features
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-12">
            Keep your HubSpot implementation needs organized under one roof.
            Manage your onboarding quickly, easily and efficiently.
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border border-border bg-card transition-colors hover:border-primary/30">
              <CardHeader>
                <CardTitle className="text-heading">
                  Guided Discovery
                </CardTitle>
                <CardDescription>
                  A conversational assistant guides you to understand your goals
                  and recommend the right hubs and modules.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border border-border bg-card transition-colors hover:border-primary/30">
              <CardHeader>
                <CardTitle className="text-heading">
                  Personalized Plan
                </CardTitle>
                <CardDescription>
                  Get an implementation plan with concrete recommendations and a
                  downloadable PDF to share with your team.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border border-border bg-card transition-colors hover:border-primary/30">
              <CardHeader>
                <CardTitle className="text-heading">
                  HubSpot Integration
                </CardTitle>
                <CardDescription>
                  Get tailored recommendations for Marketing, Sales, Service,
                  and CMS Hubs based on your specific needs.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border border-border bg-card transition-colors hover:border-primary/30">
              <CardHeader>
                <CardTitle className="text-heading">
                  Share & Collaborate
                </CardTitle>
                <CardDescription>
                  Export your plan as PDF and share it with stakeholders. Keep
                  everyone aligned on the implementation roadmap.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Monitor section */}
      <section
        className="py-16 md:py-24"
        aria-label="Track progress"
      >
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="rounded-xl border border-border bg-card p-8 md:p-12">
            <div className="grid gap-8 md:grid-cols-2 md:items-center">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-heading">
                  Track your implementation progress
                </h2>
                <p className="mt-4 text-muted-foreground">
                  Keep your HubSpot implementation organized under one roof.
                  Monitor progress, follow next steps, and complete your
                  onboarding efficiently.
                </p>
                <Button asChild size="lg" className="mt-6">
                  <Link href="/sign-up">Discover our platform</Link>
                </Button>
              </div>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Implementation</span>
                    <span className="font-medium text-success">85%</span>
                  </div>
                  <Progress value={85} className="h-3" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Discovery</span>
                    <span className="font-medium text-success">100%</span>
                  </div>
                  <Progress value={100} className="h-3" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Plan ready</span>
                    <span className="font-medium text-success">100%</span>
                  </div>
                  <Progress value={100} className="h-3" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Partners */}
      <section
        className="bg-section-bg py-16 md:py-20"
        aria-label="Partners"
      >
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <h2 className="text-xl md:text-2xl font-bold text-heading text-center mb-10">
            Trusted by leading agencies
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 items-center justify-items-center opacity-60">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-10 w-24 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground"
                aria-hidden
              >
                Partner {i}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30 py-12 md:py-16">
        <div className="mx-auto max-w-6xl px-4 md:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <p className="font-semibold text-heading">Product</p>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link
                    href="/#features"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="/sign-up"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Get started
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-heading">Company</p>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link
                    href="/"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    About
                  </Link>
                </li>
                <li>
                  <Link
                    href="/"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-heading">Legal</p>
              <ul className="mt-4 space-y-2">
                <li>
                  <Link
                    href="/"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <p className="mt-12 pt-8 border-t border-border text-sm text-muted-foreground text-center">
            © 2026 Digifianz. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
