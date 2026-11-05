// Color selection with variant images
interface ColorSectionProps {
    uniqueColors: string[];
    selectedColor: string;
    setSelectedColor: (color: string) => void;
    product: any;
}

export const ColorSection = ({ uniqueColors, selectedColor, setSelectedColor, product }: ColorSectionProps) => {
    if (uniqueColors.length === 0) return null;

    return (
        <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Available Colors</h3>
            <div className="flex flex-wrap gap-3">
                {uniqueColors.map((color: string) => {
                    // Find the variant for this color to get its featured image
                    const variantForColor = product.variants.find((v: any) => v.color === color);

                    // Get the featured image from variant, or fallback to first variant image, then product featured image
                    const featuredVariantImage = variantForColor?.images?.find((img: any) => img.isFeatured)?.url;
                    const firstVariantImage = variantForColor?.images?.[0]?.url;
                    const productFeaturedImage = product.images?.find((img: any) => img.isFeatured)?.url;
                    const productFirstImage = product.images?.[0]?.url;

                    const variantImage = featuredVariantImage || firstVariantImage || productFeaturedImage || productFirstImage || product.img;

                    return (
                        <button
                            key={color}
                            onClick={() => {
                                console.log('🎨 Color Selected:', color);
                                setSelectedColor(color);
                            }}
                            className={`relative group transition-all rounded-lg ${selectedColor === color
                                    ? "ring-3 ring-orange-500 ring-offset-2"
                                    : "hover:ring-2 hover:ring-orange-300 hover:ring-offset-2"
                                }`}
                            style={{ width: '100px', height: '100px' }}
                        >
                            {/* Variant Image */}
                            <div className="w-full h-full rounded-lg overflow-hidden border-2 border-gray-200">
                                <img
                                    src={variantImage}
                                    alt={`${color} variant`}
                                    className="w-full h-full object-cover"
                                />
                            </div>

                            {/* Color Label */}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs py-1 px-2 text-center rounded-b-lg">
                                {color}
                            </div>

                            {/* Selected Checkmark */}
                            {selectedColor === color && (
                                <div className="absolute top-1 right-1 bg-orange-500 rounded-full p-1 shadow-lg">
                                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
