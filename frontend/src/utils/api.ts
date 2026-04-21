import axios from 'axios';
import type { AxiosError, AxiosInstance } from 'axios';


// API error types
export interface ApiError {
  status: string;
  detail: string;
  code?: string;
}

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000, // 30 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth headers
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    // Handle different error status codes
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          console.error('Bad Request:', data.detail);
          break;
        case 401:
          console.error('Unauthorized - clearing stored auth');
          localStorage.removeItem('auth_token');
          break;
        case 403:
          console.error('Forbidden:', data.detail);
          break;
        case 404:
          console.error('Not Found:', data.detail);
          break;
        case 413:
          console.error('File too large:', data.detail);
          break;
        case 422:
          console.error('Validation Error:', data.detail);
          break;
        case 500:
          console.error('Server Error:', data.detail);
          break;
        default:
          console.error('API Error:', data.detail);
      }
    } else if (error.request) {
      // Request was made but no response
      console.error('Network Error: No response received');
    } else {
      console.error('Error:', error.message);
    }

    return Promise.reject(error);
  }
);

// File upload types
export interface ReconciliationResult {
  invoice_id: string;
  issue_type: string;
  severity: 'Low' | 'Medium' | 'High';
  reason: string;
  suggested_action: string;
  explanation: string;
  confidence: string;
  company_qty: number;
  customer_qty: number;
  company_price: number;
  customer_price: number;
}

export interface ReconciliationResponse {
  status: string;
  message: string;
  data: ReconciliationResult[];
  statistics?: {
    total_mismatches: number;
    missing_invoices: number;
    quantity_mismatches: number;
    price_mismatches: number;
    total_discrepancy_value: number;
  };
  cache_stats?: {
    enabled: boolean;
    size: number;
    hits: number;
    misses: number;
  };
}

// API functions
export const reconciliationApi = {
  /**
   * Upload files for reconciliation
   */
  async reconcile(companyFile: File, customerFile: File): Promise<ReconciliationResponse> {
    const formData = new FormData();
    formData.append('company_file', companyFile);
    formData.append('customer_file', customerFile);

    const response = await apiClient.post<ReconciliationResponse>('/reconcile', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    return response.data;
  },

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{ enabled: boolean; size: number; hits: number; misses: number }> {
    const response = await apiClient.get('/cache/stats');
    return response.data;
  },

  /**
   * Clear cache
   */
  async clearCache(): Promise<{ status: string; message: string }> {
    const response = await apiClient.post('/cache/clear');
    return response.data;
  },

  /**
   * Get application statistics
   */
  async getStatistics(): Promise<{
    app_name: string;
    version: string;
    debug_mode: boolean;
    llm_configured: boolean;
    llm_model: string;
    cache_enabled: boolean;
    max_file_size_mb: number;
  }> {
    const response = await apiClient.get('/statistics');
    return response.data;
  },

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; version: string; llm_configured: boolean }> {
    const response = await apiClient.get('/health');
    return response.data;
  },
};

export default apiClient;
