export type PagedResponse<T> = {
    page: number;
    pageSize: number;
    total: number;
    sort?: string;
    items: T[];
};
