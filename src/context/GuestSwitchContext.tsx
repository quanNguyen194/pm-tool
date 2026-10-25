import { createContext, useContext } from 'react';

/** Chuyển giữa chế độ thành viên và chế độ Khách (xem dự án Công khai). Do AuthGate cung cấp. */
export interface GuestSwitch {
  /** Người đã đăng nhập nhưng chưa là thành viên: chuyển sang xem dự án công khai này với tư cách Khách. */
  enter: (projectCode: string) => void;
  /** Rời chế độ Khách: người chưa đăng nhập sang trang đăng nhập, người đã đăng nhập về dự án của mình. */
  exit: () => void;
  /** Có phiên đăng nhập thật phía sau chế độ Khách hay không. */
  signedIn: boolean;
}

export const GuestSwitchContext = createContext<GuestSwitch>({ enter: () => undefined, exit: () => undefined, signedIn: false });
export const useGuestSwitch = () => useContext(GuestSwitchContext);
