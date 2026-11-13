// Official product renders from aulastar.com, used with the device models.
import s75pro from './devices/s75pro.png';
import s75pro2 from './devices/s75pro-2.png';
import sc900 from './devices/sc900.png';
import sc9002 from './devices/sc900-2.png';
import sc9003 from './devices/sc900-3.png';
import f75 from './devices/f75.png';
import s75proTop from './devices/s75pro-top.png';
import f75Top from './devices/f75-top.png';
import l99Top from './devices/l99-top.png';
import sc390 from './devices/sc390.png';
import sc3902 from './devices/sc390-2.png';

export const IMAGES: Record<string, string> = {
  s75pro, 's75pro-2': s75pro2, sc900, 'sc900-2': sc9002, 'sc900-3': sc9003, f75, 's75pro-top': s75proTop, 'f75-top': f75Top, 'l99-top': l99Top, sc390, 'sc390-2': sc3902,
};

export const imageFor = (id: string): string => IMAGES[id] ?? '';
