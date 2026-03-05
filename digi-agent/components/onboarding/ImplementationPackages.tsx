'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, ArrowRight } from 'lucide-react'

interface Package {
    id: string
    title: string
    subtitle?: string
    description: string[]
    price: string
    priceSubtext?: string
    buttonText: string
    buttonColor: string
    bgColor: string
    textColor: string
    featured?: boolean
}

const packages: Package[] = [
    {
        id: 'ai-implementation',
        title: 'Continue with AI Implementation',
        description: [
            'Includes 3 hours of implementation by our team. We will:',
            'Start implementing your AI Onboarding Plan',
            'Leave you with a detailed plan of Next Steps for you to get the most out of your implementation.',
            'Does NOT include meetings',
            'Support is exclusively via email and limited to the duration of the project.',
            'Subject to full terms and conditions'
        ],
        price: 'US $600',
        buttonText: 'Continue',
        buttonColor: 'bg-green-600 hover:bg-green-700',
        bgColor: 'bg-green-50',
        textColor: 'text-green-900',
        featured: true
    },
    {
        id: 'core-onboarding',
        title: 'Core Onboarding:',
        description: [
            '5 Hours of implementation for your first Hub over 5 weeks',
            '+ 3 Hours and 3 additional weeks of implementation for each additional Hub',
            'Implementation completed exclusively in weekly one-hour-long calls'
        ],
        price: 'Starting at US $1,060',
        buttonText: 'Continue',
        buttonColor: 'bg-purple-600 hover:bg-purple-700',
        bgColor: 'bg-purple-50',
        textColor: 'text-purple-900'
    },
    {
        id: 'enhanced-onboarding',
        title: 'Enhanced Onboarding:',
        description: [
            'Starting at 20 hours of online AND offline implementation over 5 weeks'
        ],
        price: 'Starting at US $3,880',
        buttonText: 'Continue',
        buttonColor: 'bg-blue-600 hover:bg-blue-700',
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-900'
    }
]

export function ImplementationPackages() {
    const handlePackageSelect = (packageId: string) => {
        if (packageId === 'ai-implementation') {
            // Primer plan ($600): Abrir popup con link de HubSpot Payments
            const paymentUrl = 'https://payments-na1.hubspot.com/payments/cQcsRQZfHn4?referrer=PAYMENT_LINK'
            const popupWidth = 600
            const popupHeight = 800
            const left = (window.screen.width - popupWidth) / 2
            const top = (window.screen.height - popupHeight) / 2
            
            window.open(
                paymentUrl,
                'HubSpotPayment',
                `width=${popupWidth},height=${popupHeight},left=${left},top=${top},resizable=yes,scrollbars=yes`
            )
        } else {
            // Otros dos planes: Abrir nueva pestaña con link de pricing
            const pricingUrl = 'https://www.digifianz.com/pricing#hs-implementation'
            window.open(pricingUrl, '_blank', 'noopener,noreferrer')
        }
    }

    return (
        <div className="w-full max-w-5xl mx-auto space-y-6 py-8">
            <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2 mb-4">
                    <h2 className="text-3xl font-bold">Choose your implementation package</h2>
                </div>
            </div>

            {/* Featured Package - Full Width */}
            <Card className={`${packages[0].bgColor} border-2 border-green-600`}>
                <CardHeader>
                    <CardTitle className={`text-2xl ${packages[0].textColor}`}>
                        {packages[0].title}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <p className={packages[0].textColor}>{packages[0].description[0]}</p>
                        <ul className="space-y-2 ml-6">
                            {packages[0].description.slice(1).map((item, idx) => (
                                <li key={idx} className={`flex items-start gap-2 ${packages[0].textColor}`}>
                                    <span className="mt-1">•</span>
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="pt-4">
                        <p className={`text-3xl font-bold ${packages[0].textColor} mb-4`}>
                            PRICE: {packages[0].price}
                        </p>
                        <Button
                            className={`w-full ${packages[0].buttonColor} text-white`}
                            size="lg"
                            onClick={() => handlePackageSelect(packages[0].id)}
                        >
                            {packages[0].buttonText} <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Other Packages Section */}
            <div className="pt-6">
                <h3 className="text-xl font-bold text-center mb-6">
                    Need more time with our team? Have a look at our other implementations:
                </h3>

                <div className="grid md:grid-cols-2 gap-6">
                    {packages.slice(1).map((pkg) => (
                        <Card key={pkg.id} className={`${pkg.bgColor} border-2`}>
                            <CardHeader>
                                <CardTitle className={`text-xl ${pkg.textColor}`}>
                                    {pkg.title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <ul className="space-y-2">
                                    {pkg.description.map((item, idx) => (
                                        <li key={idx} className={`flex items-start gap-2 ${pkg.textColor}`}>
                                            <span className="mt-1">•</span>
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>

                                <div className="pt-4">
                                    <p className={`text-2xl font-bold ${pkg.textColor} mb-4`}>
                                        PRICE: {pkg.price}
                                    </p>
                                    <Button
                                        className={`w-full ${pkg.buttonColor} text-white`}
                                        onClick={() => handlePackageSelect(pkg.id)}
                                    >
                                        {pkg.buttonText} <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}
