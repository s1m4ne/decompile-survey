import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { screeningApi, ScreeningRequest } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Play, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export function ScreeningPage() {
  const navigate = useNavigate();

  const [inputFile, setInputFile] = useState('');
  const [rulesFile, setRulesFile] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [concurrency, setConcurrency] = useState(10);

  const { data: rules } = useQuery({
    queryKey: ['screening-rules'],
    queryFn: screeningApi.listRules,
  });

  const { data: inputs } = useQuery({
    queryKey: ['screening-inputs'],
    queryFn: screeningApi.listInputs,
  });

  const runMutation = useMutation({
    mutationFn: screeningApi.run,
    onSuccess: (data) => {
      if (data.run_id) {
        navigate(`/reviews/${data.run_id}`);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputFile || !rulesFile) return;

    runMutation.mutate({
      input_file: inputFile,
      rules_file: rulesFile,
      model,
      concurrency,
    });
  };

  const isValid = inputFile && rulesFile;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Run Screening</h2>
        <p className="text-gray-500 mt-1">
          Execute AI-powered paper screening on a BibTeX file
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Input file */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Input BibTeX File
              </label>
              <Select
                value={inputFile}
                onChange={(e) => setInputFile(e.target.value)}
              >
                <option value="">Select a file...</option>
                {inputs?.map((input) => (
                  <option key={input.path} value={input.path}>
                    {input.database} / {input.filename}
                  </option>
                ))}
              </Select>
            </div>

            {/* Rules file */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Screening Rules
              </label>
              <Select
                value={rulesFile}
                onChange={(e) => setRulesFile(e.target.value)}
              >
                <option value="">Select rules...</option>
                {rules?.map((rule) => (
                  <option key={rule.filename} value={rule.filename}>
                    {rule.title}
                  </option>
                ))}
              </Select>
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Model
              </label>
              <Select value={model} onChange={(e) => setModel(e.target.value)}>
                <option value="gpt-4o-mini">gpt-4o-mini (fast, cheap)</option>
                <option value="gpt-4o">gpt-4o (accurate)</option>
                <option value="gpt-4-turbo">gpt-4-turbo</option>
              </Select>
            </div>

            {/* Concurrency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Concurrency
              </label>
              <Input
                type="number"
                min={1}
                max={50}
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value) || 10)}
                className="w-24"
              />
              <p className="text-xs text-gray-500 mt-1">
                Number of parallel API calls
              </p>
            </div>

            {/* Submit */}
            <div className="pt-4 border-t border-gray-100">
              <Button
                type="submit"
                disabled={!isValid || runMutation.isPending}
                className="w-full"
              >
                {runMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Screening
                  </>
                )}
              </Button>
            </div>

            {/* Status */}
            {runMutation.isSuccess && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-md">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">
                  Screening completed! Redirecting to review...
                </span>
              </div>
            )}

            {runMutation.isError && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-md">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">
                  {runMutation.error?.message || 'Screening failed'}
                </span>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
