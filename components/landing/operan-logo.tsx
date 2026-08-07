import Image from 'next/image';

export function OperanLogoIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <Image
      src="/Logo.png"
      alt="OPERAN"
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
    />
  );
}

export function OperanLogoBrand({ iconSize = 28, className = '' }: { iconSize?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <OperanLogoIcon size={iconSize} />
      <span className="text-lg font-bold tracking-tight text-white">OPERAN</span>
    </div>
  );
}
