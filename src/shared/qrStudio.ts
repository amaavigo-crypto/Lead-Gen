export type QrTemplateType = 'menu' | 'business-profile' | 'offer' | 'lead-capture' | 'blank';
export type QrDestinationType = 'website' | 'pdf' | 'menu' | 'enquiry' | 'custom' | 'whatsapp';
export type QrPrintFormat = 'a4' | 'a5' | 'table-tent' | 'square' | 'flyer' | 'business-card';
export type QrPrintTheme = 'minimal' | 'brand' | 'bold';
export type QrCodeStatus = 'draft' | 'active' | 'paused' | 'archived';
export type QrBlockType = 'hero' | 'text' | 'image' | 'gallery' | 'video' | 'lottie' | 'button' | 'form' | 'menu' | 'products' | 'divider';

export interface QrFormField {
  id: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'checkbox';
  placeholder?: string;
  required?: boolean;
  options?: string[];
  showWhen?: { fieldId: string; operator: 'equals' | 'not_equals' | 'contains' | 'is_filled'; value?: string };
}

export interface QrPageBlock {
  id: string;
  type: QrBlockType;
  title?: string;
  body?: string;
  label?: string;
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  lottieUrl?: string;
  href?: string;
  animation?: 'none' | 'fade' | 'slide' | 'zoom' | 'stagger' | 'float' | 'parallax' | 'scroll';
  items?: any[];
  fields?: QrFormField[];
  backgroundColor?: string;
  align?: 'left' | 'center' | 'right';
}

export interface QrPageTheme {
  backgroundType: 'solid' | 'gradient' | 'image' | 'video';
  backgroundColor: string;
  backgroundImage?: string;
  backgroundVideo?: string;
  gradientFrom: string;
  gradientTo: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  buttonTextColor: string;
  fontFamily: string;
  cardRadius: number;
  buttonRadius: number;
  contentWidth: number;
}

export interface QrPageDocument {
  title: string;
  description: string;
  theme: QrPageTheme;
  blocks: QrPageBlock[];
}

export interface QrCodeStyle {
  shape: 'square' | 'rounded' | 'dots';
  foregroundColor: string;
  backgroundColor: string;
  logoUrl?: string;
  frameText?: string;
}

export interface QrPrintDesign {
  format: QrPrintFormat;
  theme: QrPrintTheme;
  headline: string;
  subheadline: string;
  footerText: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  logoUrl?: string;
}

export interface QrAnalytics {
  scanCount: number;
  pageViewCount: number;
  uniqueVisitorCount: number;
  leadCount: number;
  ctaClickCount: number;
}

export interface QrStudioCode {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  template: QrTemplateType;
  code: string;
  status: QrCodeStatus;
  destination: { kind: 'page' | 'url'; type?: QrDestinationType; url?: string; assetId?: string; fileName?: string };
  pageData: QrPageDocument;
  publishedPage?: QrPageDocument;
  qrStyle: QrCodeStyle;
  printDesign?: QrPrintDesign;
  schedule?: { startsAt?: string; endsAt?: string };
  folder?: string;
  tags?: string[];
  analytics: QrAnalytics;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  lastScannedAt?: string;
}

export interface QrSavedTheme {
  id: string;
  name: string;
  kind: 'theme' | 'section';
  theme?: Partial<QrPageTheme>;
  block?: QrPageBlock;
  createdAt: string;
  updatedAt: string;
}

const baseTheme: QrPageTheme = {
  backgroundType: 'solid',
  backgroundColor: '#F7F8FC',
  gradientFrom: '#101A3A',
  gradientTo: '#4169E1',
  textColor: '#18233E',
  mutedColor: '#64748B',
  accentColor: '#3459E8',
  buttonTextColor: '#FFFFFF',
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  cardRadius: 22,
  buttonRadius: 14,
  contentWidth: 720,
};

const block = (type: QrBlockType, props: Partial<QrPageBlock> = {}): QrPageBlock => ({
  id: `blk_${Math.random().toString(36).slice(2, 10)}`,
  type,
  animation: 'fade',
  ...props,
});

export function createQrPageTemplate(template: QrTemplateType, businessName = 'Your business'): QrPageDocument {
  const theme = { ...baseTheme };
  const hero = (title: string, body: string, imageUrl?: string) => block('hero', {
    title, body, label: businessName, imageUrl, animation: 'fade',
  });
  switch (template) {
    case 'menu':
      return {
        title: `${businessName} menu`,
        description: 'Explore our menu and discover your favourites.',
        theme,
        blocks: [
          hero('Freshly made. Beautifully served.', 'Explore our menu, discover favourites and ask our team for recommendations.'),
          block('menu', { title: 'Our menu', items: [
            { category: 'Starters', items: [{ name: 'Seasonal special', description: 'A fresh favourite from our kitchen', price: '₹249' }] },
            { category: 'Mains', items: [{ name: 'Signature dish', description: 'Made with carefully selected ingredients', price: '₹449' }] },
            { category: 'Drinks', items: [{ name: 'House refresher', description: 'A refreshing house favourite', price: '₹149' }] },
          ] }),
          block('button', { label: 'Contact our team', href: 'https://wa.me/', align: 'center' }),
        ],
      };
    case 'business-profile':
      return {
        title: businessName,
        description: 'Discover our business, services and contact details.',
        theme: { ...theme, backgroundType: 'gradient', textColor: '#FFFFFF', mutedColor: '#E2E8F0' },
        blocks: [
          hero('A better way to do business.', 'A little about what makes us different. Add your story, services and the best way to reach you.'),
          block('text', { title: 'About us', body: 'Tell visitors who you are, what you do and why customers choose your business.' }),
          block('button', { label: 'Call us', href: 'tel:+910000000000', align: 'center' }),
          block('button', { label: 'Email us', href: 'mailto:hello@example.com', align: 'center' }),
        ],
      };
    case 'offer':
      return {
        title: `${businessName} special offer`,
        description: 'A limited-time offer from our team.',
        theme: { ...theme, backgroundType: 'gradient', textColor: '#FFFFFF', mutedColor: '#E2E8F0', gradientFrom: '#101A3A', gradientTo: '#7C3AED' },
        blocks: [
          hero('A little something special.', 'Share your offer, explain the value and give people a clear next step.'),
          block('text', { title: 'Your exclusive offer', body: 'Add your promotion details, terms and expiry date here.' }),
          block('button', { label: 'Claim this offer', href: 'https://example.com', align: 'center' }),
        ],
      };
    case 'lead-capture':
      return {
        title: `Get in touch with ${businessName}`,
        description: 'Tell us a little about what you need and our team will be in touch.',
        theme,
        blocks: [
          hero('Let’s start a conversation.', 'Share your details and our team will get back to you.'),
          block('form', { title: 'Send an enquiry', body: 'We usually respond within one business day.', fields: [
            { id: 'fullName', label: 'Your name', type: 'text', placeholder: 'Enter your name', required: true },
            { id: 'email', label: 'Email address', type: 'email', placeholder: 'you@example.com', required: true },
            { id: 'phone', label: 'Phone number', type: 'tel', placeholder: '+91 98765 43210' },
            { id: 'message', label: 'How can we help?', type: 'textarea', placeholder: 'Tell us a little about your enquiry' },
            { id: 'consent', label: 'I agree to be contacted about this enquiry.', type: 'checkbox', required: true },
          ] }),
        ],
      };
    default:
      return { title: businessName, description: 'A custom experience created with QR Studio.', theme, blocks: [
        hero('Your experience starts here.', 'Add content, images, videos, forms and buttons to create your own page.'),
      ] };
  }
}


export function createQrPrintDesign(businessName = 'Your business'): QrPrintDesign {
  return {
    format: 'a4',
    theme: 'minimal',
    headline: 'Scan to explore',
    subheadline: 'Use your phone camera to get started',
    footerText: businessName,
    backgroundColor: '#FFFFFF',
    textColor: '#17213D',
    accentColor: '#155EEF',
    logoUrl: '',
  };
}
