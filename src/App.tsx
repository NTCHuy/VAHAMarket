import { Link, Route, Routes } from 'react-router-dom';
import Layout from '@/components/Layout';
import RequireAuth from '@/components/RequireAuth';
import Home from '@/pages/Home';
import AccountSettings from '@/pages/AccountSettings';
import CreateListing from '@/pages/CreateListing';
import MyListings from '@/pages/MyListings';
import AdminDashboard from '@/pages/AdminDashboard';
import ListingDetail from '@/pages/ListingDetail';
import Orders from '@/pages/Orders';
import OrderDetail from '@/pages/OrderDetail';
import Support from '@/pages/Support';
import Transparency from '@/pages/Transparency';
import Terms from '@/pages/Terms';

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
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="listing/:id" element={<ListingDetail />} />
        <Route path="transparency" element={<Transparency />} />
        <Route path="support" element={<Support />} />
        <Route path="terms" element={<Terms />} />

        <Route element={<RequireAuth />}>
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
  );
}
