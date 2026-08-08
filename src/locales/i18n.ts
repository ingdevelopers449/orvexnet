import { es } from './es';
import { en } from './en';

const locales: Record<string, any> = {
    es,
    en
};

export function t(ctx: any, key: string): string {
    const lang = ctx.session?.language || 'es';
    const dict = locales[lang] || locales['es'];
    return dict[key] || locales['es'][key] || key;
}
