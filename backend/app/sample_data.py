from __future__ import annotations

from .schemas import AnalysisResponse

SAMPLE_ANALYSIS: AnalysisResponse = AnalysisResponse.model_validate(
    {
        'signals': [
            {
                'type': 'agreement',
                'start': 0,
                'end': 10,
                'probability': 'high',
                'rationale': 'Subject nodded repeatedly while maintaining eye contact.',
            },
            {
                'type': 'confidence',
                'start': 5,
                'end': 15,
                'probability': 'medium',
                'rationale': 'Steady voice with minimal hesitation.',
            },
        ],
        'engagement_state': [
            {'start': 0, 'end': 5, 'state': 'engaged'},
            {'start': 5, 'end': 15, 'state': 'neutral'},
        ],
        'conversation_quality': {
            'overall': {
                'quality_index': 72,
                'clarity': 67,
                'authority': 68,
                'energy': 80,
                'rapport': 75,
                'learning': 70,
            },
            'timeline': [
                {
                    'start': 0,
                    'end': 10,
                    'values': {
                        'quality_index': 70,
                        'clarity': 69,
                        'authority': 70,
                        'energy': 78,
                        'rapport': 77,
                        'learning': 68,
                    },
                },
                {
                    'start': 10,
                    'end': 20,
                    'values': {
                        'quality_index': 74,
                        'clarity': 65,
                        'authority': 65,
                        'energy': 82,
                        'rapport': 73,
                        'learning': 72,
                    },
                },
            ],
        },
    }
)
