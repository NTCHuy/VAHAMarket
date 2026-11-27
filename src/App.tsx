import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import Layout from '@/components/Layout';
import RequireAuth from '@/components/RequireAuth';
import { PageLoader } from '@/components/ui';
import Home from '@/pages/Home';
import ListingDetail from '@/pages/ListingDetail';

const SellerProfile = lazy(() => import('@/pages/SellerProfile'));
const SavedListings = lazy(() => import('@/pages/SavedListings'));
const Messages = lazy(() => import('@/pages/Messages'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const SavedSearches = lazy(() => import('@/pages/SavedSearches'));
const AccountSettings = lazy(() => import('@/pages/AccountSettings'));
const CreateListing = lazy(() => import('@/pages/CreateListing'));
const MyListings = lazy(() => import('@/pages/MyListings'));
const Orders = lazy(() => import('@/pages/Orders'));
const OrderDetail = lazy(() => import('@/pages/OrderDetail'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const Transparency = lazy(() => import('@/pages/Transparency'));
const Support = lazy(() => import('@/pages/Support'));
const Terms = lazy(() => import('@/pages/Terms'));

function NotFound() {
  return (
    <div className="card mx-auto mt-8 max-w-md p-8 text-center">
      <h1 className="text-lg font-semibold">Không tìm thấy trang</h1>
      <Link to="/" className="btn-primary mt-4">Về trang chủ</Link>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="listing/:id" element={<ListingDetail />} />
          <Route path="u/:id" element={<SellerProfile />} />
          <Route path="transparency" element={<Transparency />} />
          <Route path="support" element={<Support />} />
          <Route path="terms" element={<Terms />} />

          <Route element={<RequireAuth />}>
            <Route path="messages" element={<Messages />} />
            <Route path="messages/:conversationId" element={<Messages />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="alerts" element={<SavedSearches />} />
            <Route path="saved" element={<SavedListings />} />
            <Route path="settings" element={<AccountSettings />} />
            <Route path="sell" element={<CreateListing />} />
            <Route path="create-listing" element={<CreateListing />} />
            <Route path="sell/:id/edit" element={<CreateListing />} />
            <Route path="my-listings" element={<MyListings />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
          </Route>

          <Route element={<RequireAuth requireAdmin />}>
            <Route path="admin" element={<AdminDashboard />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
