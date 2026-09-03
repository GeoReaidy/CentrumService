import Link from 'next/link';
import { SubscriberLinkReviewPanel } from '@/components/SubscriberLinkReviewPanel';

export default function AdminSubscriberLinksPage() {
  return <section className="animate-fade-in admin-page"><div className="admin-header"><div><div className="badge page-badge">Administrator</div><h1>Subscriber Linking</h1><p className="page-intro">Review unmatched portal accounts before connecting service access.</p></div><Link href="/admin" className="btn btn-secondary">Back to Admin Console</Link></div><SubscriberLinkReviewPanel /></section>;
}
