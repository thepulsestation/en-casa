type Props = {
  name: string;
  size?: 'sm' | 'md';
};

const positions = {
  burger: 'left top',
  eggs: 'center top',
  bread: 'right top',
  pickles: 'left center',
  sauce: 'center',
  tomatoes: 'right center',
} as const;

function artworkFor(name: string): keyof typeof positions | null {
  const normalized = name.toLocaleLowerCase('es');
  if (normalized.includes('hamburguesa')) return 'burger';
  if (normalized.includes('huevo')) return 'eggs';
  if (normalized.includes('pan') || normalized.includes('brioche'))
    return 'bread';
  if (normalized.includes('pepinill') || normalized.includes('encurtid'))
    return 'pickles';
  if (
    normalized.includes('salsa') ||
    normalized.includes('piri-piri') ||
    normalized.includes('piripiri')
  )
    return 'sauce';
  if (normalized.includes('tomate')) return 'tomatoes';
  return null;
}

function fallbackEmoji(name: string): string {
  const normalized = name.toLocaleLowerCase('es');
  if (normalized.includes('leche')) return '🥛';
  if (normalized.includes('pollo') || normalized.includes('pavo')) return '🍗';
  if (normalized.includes('yogur')) return '🥣';
  if (normalized.includes('arroz')) return '🍚';
  if (
    normalized.includes('espinaca') ||
    normalized.includes('guisante') ||
    normalized.includes('ensalada')
  )
    return '🥬';
  if (normalized.includes('queso')) return '🧀';
  if (normalized.includes('manzana') || normalized.includes('fruta'))
    return '🍎';
  return '📦';
}

export function ProductThumbnail({ name, size = 'md' }: Props) {
  const artwork = artworkFor(name);
  const dimension =
    size === 'sm' ? 'size-10 rounded-xl' : 'size-14 rounded-2xl';

  if (!artwork) {
    return (
      <span
        className={`grid ${dimension} shrink-0 place-items-center bg-muted text-[24px]`}
        aria-hidden="true"
      >
        {fallbackEmoji(name)}
      </span>
    );
  }

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return (
    <span
      className={`${dimension} shrink-0 bg-[#f4efe4] bg-no-repeat shadow-[inset_0_0_0_1px_rgb(44_45_40/6%)]`}
      style={{
        backgroundImage: `url(${basePath}/product-thumbnails.png)`,
        backgroundPosition: positions[artwork],
        backgroundSize: '300% 300%',
      }}
      aria-hidden="true"
    />
  );
}
