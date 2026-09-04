import Image from 'next/image';

type Props = {
  name: string;
  size?: 'sm' | 'md' | 'lg';
};

const artworkPaths = {
  beetroot: '/products/beetroot.webp',
  briocheBuns: '/products/brioche-buns.webp',
  broccoli: '/products/broccoli.webp',
  burger: '/products/burger.webp',
  chickenBreast: '/products/chicken-breast.webp',
  chickenThighs: '/products/chicken-thighs.webp',
  crackers: '/products/crackers.webp',
  eggs: '/products/eggs.webp',
  generic: '/products/generic.webp',
  lemons: '/products/lemons.webp',
  milk: '/products/milk.webp',
  onions: '/products/onions.webp',
  pearTomatoes: '/products/pear-tomatoes.webp',
  pickles: '/products/pickles.webp',
  piriPiri: '/products/piri-piri.webp',
  porkCubes: '/products/pork-cubes.webp',
  porkCutlets: '/products/pork-cutlets.webp',
  rice: '/products/rice.webp',
  yogurt: '/products/yogurt.webp',
} as const;

type Artwork = keyof typeof artworkPaths;

function artworkFor(name: string): Artwork {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');

  if (normalized.includes('brocoli')) return 'broccoli';
  if (normalized.includes('cebolla')) return 'onions';
  if (normalized.includes('galleta') || normalized.includes('cracker'))
    return 'crackers';
  if (normalized.includes('pan') || normalized.includes('brioche'))
    return 'briocheBuns';
  if (normalized.includes('hamburguesa')) return 'burger';
  if (normalized.includes('huevo')) return 'eggs';
  if (normalized.includes('limon')) return 'lemons';
  if (normalized.includes('milanesa')) return 'porkCutlets';
  if (normalized.includes('muslo')) return 'chickenThighs';
  if (normalized.includes('pechuga')) return 'chickenBreast';
  if (normalized.includes('pepinill') || normalized.includes('encurtid'))
    return 'pickles';
  if (normalized.includes('remolacha')) return 'beetroot';
  if (
    normalized.includes('piri-piri') ||
    normalized.includes('piripiri') ||
    normalized.includes('salsa')
  )
    return 'piriPiri';
  if (normalized.includes('taco') && normalized.includes('cerdo'))
    return 'porkCubes';
  if (normalized.includes('tomate')) return 'pearTomatoes';
  if (normalized.includes('leche')) return 'milk';
  if (normalized.includes('yogur')) return 'yogurt';
  if (normalized.includes('arroz')) return 'rice';
  if (
    normalized.includes('espinaca') ||
    normalized.includes('guisante') ||
    normalized.includes('ensalada')
  )
    return 'broccoli';
  if (normalized.includes('pollo') || normalized.includes('pavo'))
    return 'chickenBreast';
  return 'generic';
}

export function ProductThumbnail({ name, size = 'md' }: Props) {
  const artwork = artworkFor(name);
  const dimension = {
    sm: 'size-10 rounded-xl',
    md: 'size-14 rounded-2xl',
    lg: 'size-[112px] rounded-full sm:size-[124px]',
  }[size];
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

  return (
    <span
      className={`relative grid ${dimension} shrink-0 place-items-center overflow-hidden bg-[#f4efe4] shadow-[inset_0_0_0_1px_rgb(44_45_40/6%)]`}
    >
      <Image
        src={`${basePath}${artworkPaths[artwork]}`}
        alt=""
        aria-hidden="true"
        fill
        sizes={size === 'lg' ? '124px' : size === 'md' ? '56px' : '40px'}
        className="object-cover object-center"
        priority={size === 'lg'}
        unoptimized
      />
    </span>
  );
}
