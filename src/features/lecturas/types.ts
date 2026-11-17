export type Lectura = {
    id: number;
    title: string;
    id_from_xml: string;
    content_xml: string;
    content_html: string;
    created_at: string;
    updated_at: string;
};

export interface XmlLLectura {
    id?: string;
    title: string;
    summary: string;
    author: string;
    date: string;
    number?: string;
    volume?: string;
    html: string;
}
